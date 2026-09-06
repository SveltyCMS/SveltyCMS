/**
 * @file src/routes/(app)/config/collectionbuilder/collection-code-generator.ts
 * @description Real-time client-side TypeScript code generator for SveltyCMS collections.
 *
 * Features:
 * - Generates clean, formatted defineCollection({ ... }) TypeScript code
 * - Mirrors the output of server compilation for 100% GUI-to-code parity
 * - Reactive and lightweight for live split-view rendering in the Collection Builder
 */

import type { FieldInstance } from "@src/content/types";

export interface CollectionCodeData {
  _id?: string;
  name?: string;
  icon?: string;
  status?: string;
  slug?: string;
  description?: string;
}

/** Formats a JS value into pretty-printed TypeScript object syntax */
function formatPropValue(value: unknown, indentLevel = 3): string {
  const indent = "  ".repeat(indentLevel);
  const nextIndent = "  ".repeat(indentLevel + 1);

  if (value === null || value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value
      .map((item) => `${nextIndent}${formatPropValue(item, indentLevel + 1)}`)
      .join(",\n");
    return `[\n${items},\n${indent}]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).filter(
      (k) => !k.startsWith("_") && k !== "__fieldIndex",
    );
    if (keys.length === 0) return "{}";
    const entries = keys.map((k) => {
      const val = (value as Record<string, unknown>)[k];
      return `${nextIndent}${k}: ${formatPropValue(val, indentLevel + 1)}`;
    });
    return `{\n${entries.join(",\n")},\n${indent}}`;
  }

  return String(value);
}

/** Capitalizes a widget key to canonical Widget Name (e.g. "input" -> "Input") */
function formatWidgetName(widgetKey: string): string {
  const parts = widgetKey.split(/[-_]/);
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

/**
 * Generates formatted TypeScript code representing a collection definition.
 *
 * @param data - The metadata of the collection
 * @param fields - The array of FieldInstances
 * @returns Formatted TypeScript code string
 */
export function generateCollectionTypeScript(
  data: CollectionCodeData,
  fields: FieldInstance[] = [],
): string {
  const collectionName = data.name || "Untitled";
  const collectionId = (data._id || collectionName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  const collectionIcon = data.icon || "bi:collection";
  const collectionStatus = data.status || "published";
  const collectionSlug = data.slug || collectionId.replace(/_/g, "-");
  const collectionDesc = data.description ? JSON.stringify(data.description) : '""';

  // Format field function calls
  const formattedFields = fields.map((field) => {
    const widgetName = field.widget?.Name
      ? formatWidgetName(field.widget.Name)
      : formatWidgetName(field.widget?.key || "Input");

    // Extract relevant widget properties, omitting internal UI properties
    const props: Record<string, unknown> = {
      label: field.label || "Field",
      db_fieldName: field.db_fieldName || "field",
    };

    if (field.required) props.required = true;
    if (field.description) props.description = field.description;
    if (field.icon) props.icon = field.icon;

    // Merge widget-specific props if available
    if (field.widget && typeof field.widget === "object") {
      const widgetObj = field.widget as Record<string, unknown>;
      for (const [k, v] of Object.entries(widgetObj)) {
        if (
          !k.startsWith("_") &&
          !["Name", "key", "label", "db_fieldName", "required", "icon", "description"].includes(
            k,
          ) &&
          v !== undefined
        ) {
          props[k] = v;
        }
      }
    }

    const fieldLines = Object.entries(props).map(
      ([k, v]) => `      ${k}: ${formatPropValue(v, 3)},`,
    );

    return `    widgets.${widgetName}({\n${fieldLines.join("\n")}\n    }),`;
  });

  const fieldsBlock = formattedFields.length > 0 ? `[\n${formattedFields.join("\n")}\n  ]` : "[]";

  return `/**
 * @file config/collections/${collectionId}.ts
 * @description ${collectionName} collection definition.
 */

import widgets from '@widgets';
import { defineCollection } from '@src/content';

export default defineCollection({
  _id: ${JSON.stringify(collectionId)},
  name: ${JSON.stringify(collectionName)},
  icon: ${JSON.stringify(collectionIcon)},
  status: ${JSON.stringify(collectionStatus)},
  slug: ${JSON.stringify(collectionSlug)},
  description: ${collectionDesc},
  fields: ${fieldsBlock},
});
`;
}
