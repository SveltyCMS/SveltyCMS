/**
 * @file src/services/sdk/namespaces/collections/write-pipeline.ts
 * @description
 * Write-path helpers for the collections namespace: single-pass field
 * preparation, schema lifecycle hooks, field-permission guard, and the
 * centralized widget pipeline.
 *
 * ### Features:
 * - prepareWritePayload: sanitize + constraints + stamps + DateTime inline + hooks
 * - schema hook pipeline with numeric-range gate (AppError, 400)
 * - assertWriteAllowed for non-admin/non-system writes on schemas with fields
 * - applyWidgetPipeline: collectionModelCache lookup + resilient model resolve
 *   + modifyRequest (XSS already applied in prepareWritePayload when skipSanitize)
 * - writeTouchesActiveWidgets: skip async pipeline when payload has no widget fields
 */

import {
  prepareCollectionFields,
  validateNumericFields,
  type CollectionFieldPrepFlags,
} from "@src/content/content-utils";
import { applySchemaHookPipeline } from "@src/content/schema-hooks";
import { modifyRequest, type EntryData } from "@utils/modify-request";
import { AppError } from "@utils/error-handling";
import { hasIsoDateTimePrefix, nowISODateString, toISOString } from "@src/utils/date";
import { assertWriteAllowed } from "@src/services/security/field-permission-service";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { FieldInstance, Schema } from "@src/content/types";
import { collectionModelCache, getModelResilient, type SchemaHotFlags } from "./schema-store";
import { sanitizeObject } from "@utils/security/input-sanitizer";

/** Structural schema view accepted by the content prep/validation helpers. */
export type PrepFieldSchema = {
  fields?: Array<{
    db_fieldName: string;
    name?: string;
    type?: string;
    min?: number;
    max?: number;
    maxLength?: number;
    widget?: { Name?: string };
  }>;
};

export interface PrepareWritePayloadOptions {
  user: any;
  system?: boolean;
  operation: "create" | "update";
  tenantId: DatabaseId | null | undefined;
  /** Entry id for the update path (field-permission context). */
  entryId?: string;
}

/**
 * Single-pass write payload preparation used by create() and update():
 * (a) sanitize + constraints via prepareCollectionFields (flagged by hot flags)
 * (b) clone via `{...data}` only when the helper returned the same reference
 * (c) stamp tenantId/createdBy/createdAt (create) or updatedBy/updatedAt (update)
 * (d) schema hooks via applySchemaHookPipeline with the numeric-range gate
 *     (FIELD_VALIDATION_ERROR AppError, 400) — direct gate when no hooks
 * (e) assertWriteAllowed for non-admin/non-system writes on schemas with fields
 */
export function prepareWritePayload(
  data: any,
  schema: Schema,
  hot: SchemaHotFlags,
  opts: PrepareWritePayloadOptions,
): any {
  const { user, system, operation, tenantId, entryId } = opts;

  const prepFlags: CollectionFieldPrepFlags = {
    sanitize: hot._hasSanitizableFields,
    constraints: hot._hasConstrainedFields,
  };
  let entryData = prepareCollectionFields(data, schema as PrepFieldSchema, prepFlags);

  if (entryData === data) {
    entryData = { ...data };
  }

  if (operation === "create") {
    entryData.tenantId = tenantId;
    entryData.createdBy = system ? "system" : user?._id;
    entryData.createdAt = nowISODateString();
  } else {
    entryData.updatedBy = system ? "system" : user?._id;
    entryData.updatedAt = nowISODateString();
  }

  // XSS pass lives here so create/update can skip the async widget pipeline
  // when no widget actually needs modifyRequest (DateTime is inlined below).
  if (hot._hasSanitizableFields !== false) {
    entryData = sanitizeObject(entryData);
  }

  if (hot._hasDateTimeFields && Array.isArray(schema.fields)) {
    for (let i = 0; i < schema.fields.length; i++) {
      const field = schema.fields[i] as FieldInstance;
      if (field.widget?.Name !== "DateTime") continue;
      const name = (field as { db_fieldName?: string }).db_fieldName;
      if (!name || !Object.hasOwn(entryData, name)) continue;
      const val = entryData[name];
      if (val === undefined || val === null || val === "") continue;
      if (typeof val === "string" && hasIsoDateTimePrefix(val)) continue;
      const normalized = toISOString(val);
      if (normalized !== val) entryData[name] = normalized;
    }
  }

  const fieldValidationError = (messages: string[]) =>
    new AppError(messages.join("; "), 400, "FIELD_VALIDATION_ERROR");

  const needsWriteGuard = !system && !user?.isAdmin && !!schema.fields && schema.fields.length > 0;

  if (hot._hasHooks && schema.hooks) {
    const hookCtx = {
      schema,
      operation,
      tenantId: tenantId as string | undefined,
      userId: user?._id as string | undefined,
    };
    const validate = hot._hasNumberFields
      ? (doc: Record<string, unknown>) => validateNumericFields(doc, schema as PrepFieldSchema)
      : undefined;
    return applySchemaHookPipeline(schema.hooks, entryData, hookCtx, validate, {
      createError: fieldValidationError,
    }).then(async (prepared) => {
      if (needsWriteGuard) {
        await assertWriteAllowed(schema.fields as FieldInstance[], prepared, user, {
          collectionName: schema.name,
          ...(entryId !== undefined ? { entryId } : {}),
          tenantId: tenantId ?? undefined,
        });
      }
      return prepared;
    });
  }

  if (hot._hasNumberFields) {
    const rangeErrors = validateNumericFields(entryData, schema as PrepFieldSchema);
    if (rangeErrors.length > 0) {
      throw fieldValidationError(rangeErrors);
    }
  }

  if (needsWriteGuard) {
    return assertWriteAllowed(schema.fields as FieldInstance[], entryData, user, {
      collectionName: schema.name,
      ...(entryId !== undefined ? { entryId } : {}),
      tenantId: tenantId ?? undefined,
    }).then(() => entryData);
  }

  return entryData;
}

/**
 * True when the payload includes at least one field that still needs the
 * async widget modifyRequest pipeline (media, SEO, geo, …). DateTime is
 * excluded — it is normalized synchronously in prepareWritePayload.
 */
export function writeTouchesActiveWidgets(hot: SchemaHotFlags, data: unknown): boolean {
  const names = hot._activeWidgetFieldNames;
  if (!names || names.length === 0) return false;
  if (!data || typeof data !== "object") return false;
  const rec = data as Record<string, unknown>;
  for (let i = 0; i < names.length; i++) {
    if (Object.hasOwn(rec, names[i])) return true;
  }
  return false;
}

export interface ApplyWidgetPipelineOptions {
  dbAdapter: IDBAdapter;
  user: any;
  type: "GET" | "POST" | "PATCH";
  tenantId?: DatabaseId | null;
  collectionName?: string;
  skipValidation?: boolean;
  action?: string;
  system?: boolean;
  /** Caller already ran sanitizeObject (create/update prepareWritePayload). */
  skipSanitize?: boolean;
}

/**
 * Centralized widget pipeline shared by find/search/loadOneById/create/update/
 * bulkCreate: collectionModelCache lookup + resilient model resolve +
 * modifyRequest. POST/PATCH sanitization happens inside modifyRequest —
 * callers must not duplicate it.
 */
export async function applyWidgetPipeline(
  schema: Schema,
  dataArray: any[],
  opts: ApplyWidgetPipelineOptions,
): Promise<void> {
  let collectionModel = collectionModelCache.get(schema);
  if (!collectionModel) {
    collectionModel = await getModelResilient(opts.dbAdapter, schema);
    collectionModelCache.set(schema, collectionModel);
  }
  await modifyRequest({
    data: dataArray as unknown as EntryData[],
    fields: schema.fields as FieldInstance[],
    collection: collectionModel as any,
    user: opts.user,
    type: opts.type,
    tenantId: (opts.tenantId as string | null | undefined) ?? undefined,
    collectionName: opts.collectionName ?? schema.name,
    skipValidation: opts.skipValidation,
    action: opts.action,
    system: opts.system,
    skipSanitize: opts.skipSanitize,
  });
}
