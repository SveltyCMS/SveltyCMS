/**
 * @file src/plugins/smart-importer/collection-scaffold.ts
 * @description Auto-provisions content collections from migration field mappings.
 *
 * Follows the Collection Builder pipeline: TS schema file → compile → refresh → createModel.
 */

import fs from "node:fs";
import path from "node:path";
import { logger } from "@utils/logger";
import type { Schema } from "@src/content/types";
import type { MappingFieldInput } from "./schema-preview";
import { buildProposedFieldsFromMappings } from "./schema-preview";
import { FALLBACK_MIGRATION_COLLECTION } from "./infer-collection";

/** Normalize wizard collection name to a safe collection _id / filename */
export function normalizeCollectionId(name: string): string {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return id || FALLBACK_MIGRATION_COLLECTION;
}

/** Map importer field types to SveltyCMS widget definitions */
export function importTypeToWidget(type: string): { Name: string; fieldType: string } {
  switch (type.toLowerCase()) {
    case "richtext":
    case "rich":
      return { Name: "RichText", fieldType: "string" };
    case "media":
    case "image":
      return { Name: "MediaUpload", fieldType: "string" };
    case "date":
    case "datetime":
      return { Name: "DateTime", fieldType: "string" };
    case "number":
      return { Name: "Number", fieldType: "number" };
    case "relation":
      return { Name: "Relation", fieldType: "string" };
    case "taxonomy":
    case "tags":
    case "tag":
      return { Name: "Tags", fieldType: "string" };
    case "select":
    case "status":
      return { Name: "Select", fieldType: "string" };
    case "boolean":
      return { Name: "Boolean", fieldType: "boolean" };
    default:
      return { Name: "Input", fieldType: "string" };
  }
}

function humanizeFieldName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Build a SveltyCMS Schema from wizard mappings */
export function buildCollectionSchemaFromMappings(
  collectionId: string,
  mappings: MappingFieldInput[],
  sourcePlatform: string,
): Schema {
  const proposed = buildProposedFieldsFromMappings(mappings);
  const fields: Schema["fields"] = [];

  for (const [fieldName, meta] of Object.entries(proposed)) {
    const widget = importTypeToWidget(meta.type);
    fields.push({
      db_fieldName: fieldName,
      name: fieldName,
      label: humanizeFieldName(fieldName),
      widget: { Name: widget.Name },
      type: widget.fieldType,
      required: fieldName === "title",
    });
  }

  const displayName = collectionId
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return {
    _id: collectionId,
    name: displayName,
    slug: collectionId,
    icon: "mdi:database-import-outline",
    status: "publish",
    description: `Auto-scaffolded from ${sourcePlatform} migration`,
    path: `/collection/${collectionId}`,
    fields,
  };
}

/** Generate a collection TypeScript source file (hybrid code/GUI sync) */
export function generateCollectionSourceFile(schema: Schema, displayPath: string): string {
  return `/**
 * @file ${displayPath}
 * @description Auto-scaffolded by Smart Importer migration wizard
 *
 * Features:
 * - auto-provisioned from import field mappings
 * - editable in Collection Builder like any GUI-created collection
 */

import type { Schema } from '@src/content/types';

export const schema = ${JSON.stringify(schema, null, "\t")} as Schema;
`;
}

export interface ProvisionCollectionResult {
  created: boolean;
  collectionId: string;
  fieldCount: number;
  filePath?: string;
}

/**
 * Provision a collection when missing: write TS schema, compile, refresh, createModel.
 */
export async function provisionCollectionFromMappings(
  dbAdapter: unknown,
  tenantId: string | null | undefined,
  collectionName: string,
  mappings: MappingFieldInput[],
  sourcePlatform: string,
): Promise<ProvisionCollectionResult> {
  const collectionId = normalizeCollectionId(collectionName);
  const { contentSystem } = await import("@src/content/index.server");
  const existing = contentSystem.getCollection(collectionId, tenantId ?? null);

  if (existing?.fields?.length) {
    return {
      created: false,
      collectionId,
      fieldCount: existing.fields.length,
    };
  }

  const schema = buildCollectionSchemaFromMappings(collectionId, mappings, sourcePlatform);
  const { getCollectionDisplayPath, getCollectionFilePath } = await import("@utils/tenant.server");
  const displayPath = getCollectionDisplayPath(collectionId, tenantId ?? null);
  const filePath = getCollectionFilePath(collectionId, tenantId ?? null);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, generateCollectionSourceFile(schema, displayPath), "utf-8");
  }

  const { markFileDirty } = await import("@src/content/content-service.server");
  const { compile } = await import("@src/utils/compilation/compile");
  markFileDirty(filePath);
  await compile({ logger, tenantId: tenantId ?? null });
  await contentSystem.refresh(tenantId ?? null);

  const adapter = dbAdapter as {
    collection?: {
      createModel?: (s: Schema, force?: boolean, opts?: { tenantId?: string }) => Promise<void>;
    };
  };
  if (adapter?.collection?.createModel) {
    try {
      await adapter.collection.createModel(schema, false, {
        tenantId: tenantId ?? undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already exists") && !msg.includes("duplicate")) {
        throw err;
      }
    }
  }

  logger.info(
    `[SmartImporter] Provisioned collection "${collectionId}" with ${schema.fields.length} fields`,
  );

  return {
    created: true,
    collectionId,
    fieldCount: schema.fields.length,
    filePath,
  };
}

/** Ensure target collection exists before import; provisions when missing */
export async function ensureTargetCollectionProvisioned(
  dbAdapter: unknown,
  tenantId: string | null | undefined,
  targetCollection: string,
  mappings: MappingFieldInput[],
  sourcePlatform: string,
): Promise<ProvisionCollectionResult> {
  const collectionId = normalizeCollectionId(targetCollection);
  const { contentSystem } = await import("@src/content/index.server");
  if (contentSystem.getCollection(collectionId, tenantId ?? null)) {
    return { created: false, collectionId, fieldCount: 0 };
  }
  return provisionCollectionFromMappings(
    dbAdapter,
    tenantId,
    collectionId,
    mappings,
    sourcePlatform,
  );
}
