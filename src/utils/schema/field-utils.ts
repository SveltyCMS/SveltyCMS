/**
 * @file src/utils/schema/field-utils.ts
 * @description Collection builder field utilities — name generation, GUI extraction, data extraction.
 */

import type { FieldInstance, FieldValue } from "@src/content/types";
import { deepCopy } from "@src/utils/object-utils";

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

/**
 * Returns the database field name for a FieldInstance, derived from its label.
 * Converts to snake_case, strips non-alphanumeric characters, and prefixes
 * digit-starting names with `_` for GraphQL compatibility.
 */
export function getFieldName(
  field: Partial<FieldInstance> & { label: string },
  rawName = false,
): string {
  if (!field) return "";

  if (field.db_fieldName) return field.db_fieldName;

  const specialMappings: Record<string, string> = {
    "First Name": "first_name",
    "Last Name": "last_name",
  };

  let name = field.label;
  if (!name && "widget" in field && (field as any).widget?.Name) {
    name = (field as any).widget.Name;
  }
  if (!name && "type" in field) {
    name = (field as any).type as string;
  }
  if (!name) name = "unknown_field";

  if (rawName) return name;
  if (specialMappings[name]) return specialMappings[name];

  let result = name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  if (/^[0-9]/.test(result)) result = "_" + result;
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
