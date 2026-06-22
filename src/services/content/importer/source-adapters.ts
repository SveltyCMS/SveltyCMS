/**
 * @file src/services/importer/source-adapters.ts
 * @description Adapters for fetching content from external CMS APIs (Drupal JSON:API, WordPress REST API).
 *
 * ### Features:
 * - Drupal JSON:API: field type detection (richtext, taxonomy, entity reference, media)
 * - WordPress REST API: rendered content detection, media, taxonomy
 * - Schema inference with format-specific type mapping
 */

import { logger } from "@utils/logger";

export interface ExternalSourceSchemaField {
  name: string;
  type: string;
}

export interface ExternalSourceData {
  items: any[];
  schema: ExternalSourceSchemaField[];
  _included?: any[];
}

/**
 * Fetch data from Drupal via JSON:API with enhanced field type detection.
 * Detects richtext (body format), taxonomy terms, entity references, and media.
 */
export async function fetchDrupalData(
  url: string,
  type: string,
  apiKey?: string,
): Promise<ExternalSourceData> {
  try {
    const endpoint = `${url.replace(/\/$/, "")}/jsonapi/node/${type}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, { headers });
    if (!response.ok) {
      throw new Error(`Drupal API error: ${response.statusText}`);
    }

    const data = await response.json();
    const items = data.data || [];
    // JSON:API includes resolved entity data (taxonomy terms, media) in `included`
    const included = data.included || [];

    const schema: ExternalSourceSchemaField[] = [];
    if (items.length > 0) {
      const first = items[0];
      const attributes = first.attributes || {};
      const relationships = first.relationships || {};

      for (const key in attributes) {
        schema.push({
          name: key,
          type: detectDrupalAttrType(key, attributes[key]),
        });
      }
      for (const key in relationships) {
        schema.push({
          name: key,
          type: detectDrupalRelType(key, relationships[key]),
        });
      }
    }

    return { items, schema, _included: included };
  } catch (error) {
    logger.error("Error fetching Drupal data:", error);
    throw error;
  }
}

/**
 * Fetch data from WordPress via REST API
 */
export async function fetchWordPressData(
  url: string,
  type: string,
  apiKey?: string,
): Promise<ExternalSourceData> {
  try {
    const endpoint = `${url.replace(/\/$/, "")}/wp-json/wp/v2/${type}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Basic ${Buffer.from(apiKey).toString("base64")}`;
    }

    const response = await fetch(endpoint, { headers });
    if (!response.ok) {
      throw new Error(`WordPress API error: ${response.statusText}`);
    }

    const items = await response.json();

    const schema: ExternalSourceSchemaField[] = [];
    if (Array.isArray(items) && items.length > 0) {
      const firstItem = items[0];
      for (const key in firstItem) {
        const val = firstItem[key];
        let type: string = typeof val;
        if (key === "featured_media") type = "media";
        else if (val && typeof val === "object" && val.rendered) type = "richtext";

        schema.push({ name: key, type });
      }
    }

    return { items, schema };
  } catch (error) {
    logger.error("Error fetching WordPress data:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Drupal JSON:API Field Type Detection Helpers
// ---------------------------------------------------------------------------

/**
 * Detect widget type for a Drupal JSON:API attribute.
 * - Complex text fields with format → richtext
 * - Image/media fields → media
 * - Date fields → date
 * - Link/email/boolean fields → their respective types
 */
function detectDrupalAttrType(fieldName: string, value: unknown): string {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Drupal text_with_summary / text_long → richtext
    if ("value" in obj && ("format" in obj || "processed" in obj)) {
      return "richtext";
    }
    // Drupal link field
    if ("uri" in obj && "title" in obj) {
      return "link";
    }
    // Drupal address/geofield
    if ("lat" in obj || "lng" in obj || "longitude" in obj) {
      return "geolocation";
    }
  }

  const lower = fieldName.toLowerCase();
  if (lower.includes("image") || lower.includes("media") || lower.includes("thumbnail")) {
    return "media";
  }
  if (
    lower.includes("date") ||
    lower.includes("time") ||
    lower.includes("created") ||
    lower.includes("changed")
  ) {
    return "date";
  }
  if (lower.includes("email")) return "email";
  if (lower.includes("link") || lower.includes("url")) return "link";
  if (lower.includes("boolean") || lower.includes("status")) return "boolean";
  if (lower.includes("number") || lower.includes("count") || lower.includes("quantity"))
    return "number";

  // Extract raw value type from nested value or top-level
  const rawVal =
    value && typeof value === "object" && "value" in (value as Record<string, unknown>)
      ? (value as Record<string, unknown>).value
      : value;
  return typeof rawVal;
}

/**
 * Detect widget type for a Drupal JSON:API relationship.
 * - Taxonomy terms (tags, categories) → taxonomy
 * - Media/file references → media
 * - User references → user
 * - Other entity references → relation
 */
function detectDrupalRelType(fieldName: string, rel: unknown): string {
  const obj = rel as Record<string, unknown>;
  const data = obj?.data;

  if (!data) return "relation";

  const typeStr = Array.isArray(data)
    ? (data[0] as Record<string, unknown>)?.type
    : (data as Record<string, unknown>)?.type;

  if (typeof typeStr === "string") {
    const lowerType = typeStr.toLowerCase();
    if (
      lowerType.includes("taxonomy") ||
      lowerType.includes("tags") ||
      lowerType.includes("category") ||
      lowerType.includes("term")
    ) {
      return "taxonomy";
    }
    if (lowerType.includes("media") || lowerType.includes("file") || lowerType.includes("image")) {
      return "media";
    }
    if (lowerType.includes("user")) {
      return "user";
    }
  }

  // Fall back to field name patterns
  const lower = fieldName.toLowerCase();
  if (
    lower.includes("tag") ||
    lower.includes("category") ||
    lower.includes("taxonomy") ||
    lower.includes("term")
  ) {
    return "taxonomy";
  }

  return "relation";
}
