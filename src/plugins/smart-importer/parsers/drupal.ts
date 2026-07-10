/**
 * @file src/plugins/smart-importer/parsers/drupal.ts
 * @description Drupal-specific export format parsers.
 *
 * Handles:
 * - JSON:API format with `included` relationship resolution
 * - Taxonomy term extraction from included data
 * - Entity reference collection for post-import ID mapping
 * - Media/image field extraction
 * - Revision data preservation (vid, revision_log)
 * - Body field with format detection
 * - Language code preservation
 * - Status mapping
 * - YAML format (Single Content Sync)
 * - CSV format (Content Export CSV)
 */

import { nowISODateString } from "@utils/date";
import type { SNCEnvelope, SNCEntry } from "../types";

/**
 * Drupal JSON:API Export → SNC Envelope
 */
export function parseDrupalJSONAPI(jsonText: string, transactionToken: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const entries: SNCEntry[] = [];

    const dataItems = raw.data || (Array.isArray(raw) ? raw : [raw]);
    const included = raw.included || raw.relationships || [];

    // Build lookup maps from included data
    const taxonomyMap = new Map<string, string[]>();
    const mediaMap = new Map<string, { url: string; alt: string }>();

    for (const inc of included) {
      const incType = inc.type || "";
      const incId = inc.id || inc.uuid || "";
      const attrs = inc.attributes || {};

      if (
        incType.includes("taxonomy_term") ||
        incType.includes("tag") ||
        incType.includes("category")
      ) {
        const name = attrs.name || attrs.title || attrs.label || incId;
        if (!taxonomyMap.has(incId)) taxonomyMap.set(incId, []);
        taxonomyMap.get(incId)!.push(name);
      }

      if (incType.includes("file") || incType.includes("media") || incType.includes("image")) {
        const url = attrs.uri?.url || attrs.url || attrs.uri || "";
        const alt = attrs.alt || attrs.title || attrs.name || "";
        if (url) mediaMap.set(incId, { url, alt });
      }
    }

    const items = Array.isArray(dataItems) ? dataItems : [dataItems];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const attrs = item.attributes || item;
      const relationships = item.relationships || {};
      const itemId = String(item.id || item.uuid || item.drupal_internal__nid || "");

      const entry: SNCEntry = {
        externalId: itemId,
        title: String(attrs.title || attrs.name || attrs.label || `Drupal ${itemId}`),
        slug: String(attrs.path?.alias || attrs.alias || attrs.url || ""),
        status: mapDrupalStatus(attrs.status || attrs.moderation_state),
        content: extractDrupalBody(attrs),
        excerpt: String(attrs.field_summary || attrs.field_description || attrs.summary || ""),
        createdAt: attrs.created || attrs.created_at || nowISODateString(),
        updatedAt: attrs.changed || attrs.updated_at || nowISODateString(),
        authorName: String(attrs.uid?.display_name || attrs.name || attrs.author || ""),
        languageCode: String(attrs.langcode || ""),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: { ...attrs },
        assetsToMirror: [],
      };

      // Resolve taxonomy
      const tags: string[] = [];
      const cats: string[] = [];
      for (const [relName, relData] of Object.entries(relationships)) {
        const relItems = (relData as any)?.data || [];
        const relArray = Array.isArray(relItems) ? relItems : [relItems];
        for (const rel of relArray) {
          const relId = rel?.id || rel?.uuid || "";
          const relType = rel?.type || "";
          if (relType.includes("tag")) tags.push(...(taxonomyMap.get(relId) || [relId]));
          if (relType.includes("category") || relType.includes("topic"))
            cats.push(...(taxonomyMap.get(relId) || [relId]));
          if (relType.includes("media") || relType.includes("image") || relType.includes("file")) {
            const media = mediaMap.get(relId);
            if (media?.url)
              entry.assetsToMirror.push({
                externalUrl: media.url,
                originalId: relId,
                fieldTarget: relName,
                altText: media.alt,
              });
          }
        }
      }

      // Direct media fields
      for (const [key, val] of Object.entries(attrs)) {
        if ((key.includes("image") || key.includes("media") || key.includes("thumbnail")) && val) {
          const url = (val as any)?.url || (val as any)?.uri?.url || (val as any)?.uri;
          if (typeof url === "string" && url.startsWith("http")) {
            entry.assetsToMirror.push({
              externalUrl: url,
              originalId: `${itemId}_${key}`,
              fieldTarget: key,
              altText: (val as any)?.alt || "",
            });
          }
        }
      }

      if (tags.length) {
        entry.taxonomies.terms.tags = tags;
        entry.taxonomies.vocabularies.push("tags");
      }
      if (cats.length) {
        entry.taxonomies.terms.categories = cats;
        entry.taxonomies.vocabularies.push("categories");
      }

      // Revision data
      if (attrs.vid || attrs.revision_id || attrs.revision_log) {
        entry.rawCustomFields._revisions = {
          vid: attrs.vid || attrs.revision_id,
          log: attrs.revision_log || "",
          timestamp: attrs.revision_timestamp || attrs.changed,
        };
      }

      entries.push(entry);
    }

    return {
      sourcePlatform: "drupal",
      version: raw.jsonapi?.version || "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

/**
 * Drupal YAML Export (Single Content Sync) → SNC Envelope
 */
export function parseDrupalYAML(yamlText: string, transactionToken: string): SNCEnvelope | null {
  try {
    const entries: SNCEntry[] = [];
    const lines = yamlText.split("\n");
    let current: Record<string, any> | null = null;

    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("_meta:")) continue;

      const leadingSpaces = line.length - line.trimStart().length;
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed
        .slice(colonIdx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (key.startsWith("-") && leadingSpaces < 4) {
        if (current && Object.keys(current).length > 0) {
          entries.push(buildDrupalSNCEntry(current, transactionToken));
        }
        current = {};
        continue;
      }

      if (!current) current = {};
      current[key] = value || null;
    }

    if (current && Object.keys(current).length > 0) {
      entries.push(buildDrupalSNCEntry(current, transactionToken));
    }

    return {
      sourcePlatform: "drupal",
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

/**
 * Drupal CSV Export → SNC Envelope
 */
export function parseDrupalCSV(csvText: string, transactionToken: string): SNCEnvelope | null {
  try {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return null;

    const headers = parseCSVLine(lines[0]);
    const entries: SNCEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0) continue;
      const raw: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) raw[headers[j]] = values[j] || "";
      entries.push(buildDrupalSNCEntry(raw, transactionToken));
    }

    return {
      sourcePlatform: "drupal",
      version: "1.0",
      transactionToken,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function mapDrupalStatus(status: any): "published" | "draft" | "pending" | "archived" {
  if (!status && status !== 0) return "draft";
  const s = String(status).toLowerCase();
  if (s === "1" || s === "true" || s === "published" || s === "publish") return "published";
  if (s === "0" || s === "false" || s === "unpublished") return "draft";
  if (s === "archived") return "archived";
  return "draft";
}

function extractDrupalBody(attrs: Record<string, any>): string {
  // Try various Drupal body field patterns
  if (attrs.body?.value) return attrs.body.value;
  if (attrs.body?.processed) return attrs.body.processed;
  if (attrs.body_value) return attrs.body_value;
  if (attrs.field_body?.value) return attrs.field_body.value;
  if (attrs.field_body) return typeof attrs.field_body === "string" ? attrs.field_body : "";
  return attrs.body || "";
}

function buildDrupalSNCEntry(raw: Record<string, any>, _transactionToken: string): SNCEntry {
  const itemId = String(raw.uuid || raw.nid || raw.id || raw._id || `drupal_${Date.now()}`);

  const entry: SNCEntry = {
    externalId: itemId,
    title: String(raw.title || raw.name || raw.label || "Untitled"),
    slug: String(raw.path || raw.alias || raw.url || ""),
    status: mapDrupalStatus(raw.status),
    content: extractDrupalBody(raw),
    excerpt: String(raw.field_summary || raw.field_description || raw.summary || ""),
    createdAt: raw.created || raw.created_at || nowISODateString(),
    updatedAt: raw.changed || raw.updated_at || nowISODateString(),
    authorName: String(raw.uid?.display_name || raw.name || raw.author || ""),
    languageCode: String(raw.langcode || ""),
    taxonomies: { vocabularies: [], terms: {} },
    rawCustomFields: { ...raw },
    assetsToMirror: [],
  };

  // Extract tags/categories from known Drupal field patterns
  const tags: string[] = [];
  const cats: string[] = [];

  for (const [key, val] of Object.entries(raw)) {
    if ((key.includes("tags") || key === "field_tags") && val) {
      const names = extractNames(val);
      if (key.includes("tag")) tags.push(...names);
      else cats.push(...names);
    }
    if ((key.includes("category") || key.includes("categories")) && val) {
      cats.push(...extractNames(val));
    }
    // Media detection
    if (
      (key.includes("image") || key.includes("media") || key.includes("thumbnail")) &&
      typeof val === "string" &&
      val.startsWith("http")
    ) {
      entry.assetsToMirror.push({
        externalUrl: val,
        originalId: `${itemId}_${key}`,
        fieldTarget: key,
      });
    }
  }

  if (tags.length) {
    entry.taxonomies.terms.tags = tags;
    entry.taxonomies.vocabularies.push("tags");
  }
  if (cats.length) {
    entry.taxonomies.terms.categories = cats;
    entry.taxonomies.vocabularies.push("categories");
  }

  // Revisions
  if (raw.vid || raw.revision_id) {
    entry.rawCustomFields._revisions = {
      vid: raw.vid || raw.revision_id,
      log: raw.revision_log || "",
    };
  }

  return entry;
}

function extractNames(val: any): string[] {
  if (typeof val === "string")
    return val
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  if (Array.isArray(val))
    return val
      .map((v: any) => (typeof v === "string" ? v : v?.name || v?.title || v?.label || ""))
      .filter(Boolean);
  return [];
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
