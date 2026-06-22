/**
 * @file src/plugins/smart-importer/schema-preview.ts
 * @description Schema diff preview between target collection and proposed import mappings.
 */

import type { Schema } from "@src/content/types";
import { generateSchemaDiff, type SchemaDiffReport } from "./advanced-features";

export interface MappingFieldInput {
  source: string;
  target: string;
  type: string;
  action?: string;
}

/** Extract { fieldName: { type } } from an existing collection schema */
export function extractExistingCollectionFields(
  schema: Schema | undefined,
): Record<string, { type: string }> {
  const fields: Record<string, { type: string }> = {};
  if (!schema?.fields) return fields;

  for (const field of schema.fields) {
    const raw = field as Record<string, unknown>;
    const name = String(raw.name || raw.db_fieldName || "");
    if (!name) continue;
    const widget = raw.widget as Record<string, unknown> | undefined;
    const type = String(widget?.Name || raw.type || "text").toLowerCase();
    fields[name] = { type: normalizeWidgetType(type) };
  }

  return fields;
}

function normalizeWidgetType(widgetName: string): string {
  const w = widgetName.toLowerCase();
  if (w.includes("richtext") || w.includes("rich")) return "richtext";
  if (w.includes("media") || w.includes("image")) return "media";
  if (w.includes("date")) return "date";
  if (w.includes("number")) return "number";
  if (w.includes("relation")) return "relation";
  if (w.includes("tag")) return "taxonomy";
  if (w.includes("select")) return "select";
  return "text";
}

/** Build proposed field map from wizard mappings */
export function buildProposedFieldsFromMappings(
  mappings: MappingFieldInput[],
): Record<string, { type: string }> {
  const fields: Record<string, { type: string }> = {
    title: { type: "text" },
    slug: { type: "text" },
    content: { type: "richtext" },
    status: { type: "select" },
  };

  for (const m of mappings) {
    if (m.action === "ignore" || !m.target) continue;
    fields[m.target] = { type: m.type || "text" };
  }

  return fields;
}

/** Compute schema diff report for dry-run preview */
export function computeSchemaDiffReport(
  existingSchema: Schema | undefined,
  mappings: MappingFieldInput[],
): SchemaDiffReport & { collectionExists: boolean; proposedFieldCount: number } {
  const existing = extractExistingCollectionFields(existingSchema);
  const proposed = buildProposedFieldsFromMappings(mappings);
  const diff = generateSchemaDiff(existing, proposed);

  return {
    ...diff,
    collectionExists: Boolean(existingSchema),
    proposedFieldCount: Object.keys(proposed).length,
  };
}
