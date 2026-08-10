/**
 * @file src/content/schema-contract.ts
 * @description Post-load schema contract for compiled collection modules.
 *
 * Soft-fail: invalid modules return null and leave last-good runtime state intact.
 * Used by the schema loader and can be shared with engine validation.
 *
 * ### Checks:
 * - Valibot field/widget shape (stricter than plain typeof checks)
 * - object shape with `fields` array
 * - name / _id presence (auto-fill from path when missing)
 * - unique `db_fieldName` / `name` among fields
 * - empty fields → soft warning (draft), not hard fail
 */

import path from "node:path";
import {
  array,
  boolean,
  looseObject,
  minLength,
  number,
  optional,
  pipe,
  record,
  safeParse,
  string,
  union,
  unknown,
} from "valibot";
import type { Schema } from "./types";

export interface SchemaContractResult {
  ok: boolean;
  schema?: Schema;
  errors: string[];
}

/** Widget config on a field — Name/name/widgetId + optional GuiFields bag */
export const WidgetConfigSchema = looseObject({
  Name: optional(string()),
  name: optional(string()),
  widgetId: optional(string()),
  GuiFields: optional(record(string(), unknown())),
  Icon: optional(string()),
  Description: optional(string()),
});

/** Single field entry — requires identity via db_fieldName or name (enforced after parse) */
export const FieldWidgetSchema = looseObject({
  db_fieldName: optional(string()),
  name: optional(string()),
  label: optional(union([string(), unknown()])),
  required: optional(boolean()),
  translated: optional(boolean()),
  icon: optional(string()),
  type: optional(string()),
  helper: optional(string()),
  widget: optional(union([string(), WidgetConfigSchema, unknown()])),
});

/** Top-level compiled schema shape (loose — plugins may add keys) */
export const CompiledSchemaShapeSchema = looseObject({
  _id: optional(string()),
  // Non-empty names only — guards against whitespace/empty collection names
  // slipping through the compile pipeline. pipe() is required here: in valibot
  // 1.4 the `string([...])` array form is parsed as an error message, so the
  // constraint would be silently dropped (empty names would pass). The
  // structuredClone targets are plain data payloads, not schema objects.
  name: optional(pipe(string(), minLength(1))),
  icon: optional(string()),
  description: optional(string()),
  status: optional(string()),
  slug: optional(string()),
  path: optional(string()),
  revision: optional(boolean()),
  livePreview: optional(union([boolean(), string()])),
  fields: array(FieldWidgetSchema),
  order: optional(number()),
  tenantId: optional(union([string(), unknown()])),
});

/**
 * Normalize module export to a candidate schema object (no validation yet).
 */
export function unwrapSchemaExport(moduleData: unknown): unknown {
  let schema = moduleData as any;
  if (schema?.default && typeof schema.default === "object") {
    schema = schema.default?.default || schema.default || schema.schema;
  } else if (schema?.schema) {
    schema = schema.schema;
  }
  return schema;
}

/**
 * Normalizes raw module export into a Schema and validates the contract.
 * Returns `{ ok: false }` without throwing — callers keep last-good output.
 */
export function assertCompiledSchema(moduleData: unknown, filePath: string): SchemaContractResult {
  const errors: string[] = [];
  let schema = unwrapSchemaExport(moduleData) as any;

  if (!schema || typeof schema !== "object") {
    return { ok: false, errors: [`No schema object in ${path.basename(filePath)}`] };
  }

  if (!schema.fields || !Array.isArray(schema.fields)) {
    if (schema.fields && typeof schema.fields === "object") {
      schema.fields = Object.values(schema.fields);
    }
    if (!Array.isArray(schema.fields)) {
      schema.fields = [];
    }
  }

  if (!schema.name || typeof schema.name !== "string") {
    const fileBase = path.basename(filePath, path.extname(filePath));
    schema.name = fileBase;
  }

  if (!schema._id) {
    schema._id = String(schema.name)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_");
  }

  // Valibot shape check (field widget configs)
  const parsed = safeParse(CompiledSchemaShapeSchema, schema);
  if (!parsed.success) {
    const issues = parsed.issues.slice(0, 8).map((i) => {
      const pathStr = i.path?.map((p) => String(p.key)).join(".") || "(root)";
      return `${pathStr}: ${i.message}`;
    });
    return {
      ok: false,
      errors: [
        `Valibot schema contract failed for ${schema.name}: ${issues.join("; ")}`,
        ...issues,
      ],
      schema: schema as Schema,
    };
  }

  // Empty fields: soft warning only — builder may save drafts; engine hard-fails at provision time
  if (schema.fields.length === 0) {
    errors.push(`'fields' is empty (${schema.name}) — schema loaded as draft`);
  }

  const fieldNames = new Set<string>();
  for (let i = 0; i < schema.fields.length; i++) {
    const field = schema.fields[i];
    if (!field || typeof field !== "object") {
      return {
        ok: false,
        errors: [`Invalid field entry at index ${i} in collection "${schema.name}"`],
        schema: schema as Schema,
      };
    }

    const widget = (field as { widget?: unknown }).widget;
    if (widget != null && typeof widget === "object") {
      const w = widget as { Name?: string; name?: string };
      if (!w.Name && !w.name) {
        errors.push(
          `Field[${i}] widget object missing Name/name in "${schema.name}" (soft — allowed)`,
        );
      }
    }

    const name =
      (field as { db_fieldName?: string; name?: string }).db_fieldName ||
      (field as { name?: string }).name;
    if (!name) {
      errors.push(`Field[${i}] missing db_fieldName/name in "${schema.name}" (soft)`);
      continue;
    }
    if (fieldNames.has(name)) {
      return {
        ok: false,
        errors: [`Duplicate field "${name}" in collection "${schema.name}"`],
        schema: schema as Schema,
      };
    }
    fieldNames.add(name);
  }

  // Soft warnings still ok:true — hard failures already returned
  return { ok: true, schema: schema as Schema, errors };
}

/**
 * Lightweight fingerprint of a structure tree for circuit-breaker compares
 * (avoids full JSON.stringify of large ContentNode graphs).
 */
export function structureFingerprint(
  nodes: Array<{
    _id?: string;
    path?: string;
    parentId?: string | null;
    order?: number;
    nodeType?: string;
    name?: string;
    collectionDef?: { fields?: unknown[] } | null;
  }>,
): string {
  let h = 2166136261;
  for (const n of nodes) {
    const fieldCount = n.collectionDef?.fields?.length ?? 0;
    const s = `${n._id ?? ""}|${n.path ?? ""}|${n.parentId ?? ""}|${n.order ?? 0}|${n.nodeType ?? ""}|${n.name ?? ""}|${fieldCount}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(36);
}
