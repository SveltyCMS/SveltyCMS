/**
 * @file src/utils/schema/field-utils.ts
 * @description Collection builder field utilities — name generation, GUI extraction, data extraction.
 */

import { deepCopy } from "@src/utils/data-utils";
import type { FieldInstance, FieldValue } from "@content/types";

/**
 * Interface for GUI field configuration in the Collection Builder.
 */
export interface GuiFieldConfig {
  required: boolean;
  widget: unknown | string;
  [key: string]: unknown;
}

/**
 * Extracts GUI field values from fieldParams based on a GUI schema definition.
 * Arrays are deep-copied to avoid mutation across widget instances.
 */
export const getGuiFields = (
  fieldParams: Record<string, unknown>,
  guiSchema: Record<string, GuiFieldConfig>,
): Record<string, unknown> => {
  const guiFields: Record<string, unknown> = {};
  for (const key in guiSchema) {
    const value = fieldParams[key];
    if (value !== undefined) {
      if (Array.isArray(value)) {
        guiFields[key] = deepCopy(value);
      } else {
        guiFields[key] = value;
      }
    }
  }
  return guiFields;
};

const fieldNameCache = new WeakMap<object, string>();
const rawFieldNameCache = new WeakMap<object, string>();

const SPECIAL_FIELD_MAPPINGS: Readonly<Record<string, string>> = Object.freeze({
  "First Name": "first_name",
  "Last Name": "last_name",
});

/**
 * Returns the database field name for a FieldInstance, derived from its label.
 * Converts to snake_case, strips non-alphanumeric characters, and prefixes
 * digit-starting names with `_` for GraphQL compatibility.
 * Fast-path: Uses WeakMap memoization on the field object.
 */
export function getFieldName(
  field: Partial<FieldInstance> & { label: string },
  rawName = false,
): string {
  if (!field || typeof field !== "object") return "";

  const cache = rawName ? rawFieldNameCache : fieldNameCache;
  const hit = cache.get(field);
  if (hit !== undefined) return hit;

  if (field.db_fieldName) {
    cache.set(field, field.db_fieldName);
    return field.db_fieldName;
  }

  let name = field.label;
  if (!name && "widget" in field && (field as any).widget?.Name) {
    name = (field as any).widget.Name;
  }
  if (!name && "type" in field) {
    name = (field as any).type as string;
  }
  if (!name) name = "unknown_field";

  if (rawName) {
    cache.set(field, name);
    return name;
  }

  if (SPECIAL_FIELD_MAPPINGS[name]) {
    const mapped = SPECIAL_FIELD_MAPPINGS[name];
    cache.set(field, mapped);
    return mapped;
  }

  let result = name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  if (/^[0-9]/.test(result)) result = "_" + result;
  cache.set(field, result);
  return result;
}

/**
 * Invokes each field's `callback` (if present) to extract its value,
 * falling back to `field.default ?? null`.
 */
export async function extractData(
  fieldsData: Record<string, FieldInstance>,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fieldsData)) {
    if (field.callback) {
      result[key] = await field.callback({
        data: field as unknown as Record<string, FieldValue>,
      });
    } else {
      result[key] = field.default ?? null;
    }
  }
  return result;
}
