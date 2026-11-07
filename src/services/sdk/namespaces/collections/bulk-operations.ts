/**
 * @file src/services/sdk/namespaces/collections/bulk-operations.ts
 * @description Bulk CRUD execution (create, update, delete, findByIds) for CollectionsNamespace.
 *
 * Features:
 * - High-throughput multi-row creation with widget pipelines and encryption
 * - Homogeneous bulk update optimization (WHERE _id IN (...) for status transitions)
 * - Per-entry bulk validation and error aggregation (assertBulkWriteValid)
 * - Single-statement bulk deletion with soft-delete/permanent support and ownership checks
 * - Raw multi-ID lookup without widget transformations (used by bulk clone/export)
 */

import { nowISODateString } from "@src/utils/date";
import { logger } from "@utils/logger";
import { AppError, raise } from "@utils/error-handling";
import { isAdmin } from "@src/databases/auth/constants";
import { prepareCollectionFields } from "@src/content/content-write-prep.server";
import { copyDataWithFreshRowIds } from "@utils/data-utils";
import {
  getReadConstraint,
  rowMatchesConstraint,
} from "@src/services/security/access-rule-service";
import { workflowKnownAbsent } from "@src/services/background/workflow-presence";
import type {
  BaseEntity,
  DatabaseId,
  DatabaseResult,
  EntityCreate,
  IDBAdapter,
  QueryFilter,
} from "@src/databases/db-interface";
import type { FieldInstance, Schema } from "@src/content/types";
import type { EntryData } from "@utils/modify-request";
import type { LocalApiOptions } from "../types";
import {
  assertBulkWriteValid,
  isPublishTransition,
  missingRequiredForPublish,
  type BulkEntryUpdate,
  type BulkRejection,
} from "./bulk-validation";
import { applyWidgetPipeline, encryptWritePayload, prepareWritePayload } from "./write-pipeline";
import { fieldEncryptionContext, readEncryptionContext, presentRead } from "./read-pipeline";
import { ensureSchemaHotFlags, type SchemaHotFlags } from "./schema-store";
import { shouldSkipWriteSideEffects, invalidateCache } from "./post-write";
import { getWorkflowServiceLazy, getPubSubLazy } from "./lazy-services";
import { ownershipFilter, ownerValue } from "./access-filter";

export interface BulkContext {
  _dbAdapter: IDBAdapter;
  schemaOf(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema>;
  getCollectionName(schemaId: string): string;
}

/** Maximum elements accepted by a single bulk write payload. */
export const MAX_BULK_BATCH_SIZE = 1_000;

function validateBulkPayloadSize(count: number, label: string): void {
  if (count > MAX_BULK_BATCH_SIZE) {
    raise(
      413,
      `Payload too large: ${label} accepts at most ${MAX_BULK_BATCH_SIZE} entries per request (received ${count}).`,
      "PAYLOAD_TOO_LARGE",
    );
  }
}

function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as { then?: unknown })?.then === "function";
}

function isShallowPatch(data: Record<string, unknown>): boolean {
  for (const value of Object.values(data)) {
    if (value !== null && typeof value === "object") return false;
  }
  return true;
}

function sameShallowPayload(updates: Array<{ data: Record<string, unknown> }>): boolean {
  if (updates.length <= 1) return true;
  const first = updates[0]?.data;
  if (!first || typeof first !== "object") return false;
  const keys = Object.keys(first);
  for (let i = 1; i < updates.length; i++) {
    const next = updates[i]?.data;
    if (!next || typeof next !== "object") return false;
    if (Object.keys(next).length !== keys.length) return false;
    for (const key of keys) {
      if (next[key] !== first[key]) return false;
    }
  }
  return true;
}

/** Stored rows for the publish gate, keyed by id — one query for the batch. */
async function loadBulkGateRows(
  ctx: BulkContext,
  schema: Schema,
  tenantId: DatabaseId | null | undefined,
  updates: readonly BulkEntryUpdate[],
): Promise<Map<string, Record<string, unknown>>> {
  const rows = new Map<string, Record<string, unknown>>();
  const found = await ctx._dbAdapter.crud.findByIds(
    ctx.getCollectionName(schema._id as string),
    updates.map((u) => u.id as DatabaseId),
    { tenantId: tenantId as DatabaseId, limit: updates.length },
  );
  if (found?.success && Array.isArray(found.data)) {
    for (const row of found.data as Array<{ _id?: unknown }>) {
      if (row && row._id !== undefined) {
        rows.set(String(row._id), row as Record<string, unknown>);
      }
    }
  }
  return rows;
}

/**
 * Per-entry gates for `bulkUpdate`, mirroring `update()`: payload preparation
 * and publish validation against stored rows.
 */
async function collectBulkRejections(
  ctx: BulkContext,
  schema: Schema,
  hot: SchemaHotFlags,
  updates: readonly BulkEntryUpdate[],
  execCtx: {
    user: unknown;
    system?: boolean;
    tenantId: DatabaseId | null | undefined;
    options: LocalApiOptions;
  },
  out: BulkRejection[],
): Promise<void> {
  const { user, system, tenantId, options } = execCtx;
  const publishing = updates.some((u) => isPublishTransition(u.data));

  let existing: Map<string, Record<string, unknown>> | undefined;
  if (publishing && (hot._hasRequiredFields || hot._hasConditionallyRequiredFields)) {
    existing = await loadBulkGateRows(ctx, schema, tenantId, updates);
  }

  for (let i = 0; i < updates.length; i++) {
    const row = updates[i];
    const payload = (row.data ?? {}) as Record<string, unknown>;
    try {
      const prepared = prepareWritePayload(payload, schema, hot, {
        user,
        system,
        operation: "update",
        tenantId,
        entryId: row.id,
        skipValidation: options.skipValidation,
      });
      if (isThenable(prepared)) await prepared;
    } catch (err) {
      out.push({
        id: row.id,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (!publishing) continue;
    const stored = existing?.get(row.id);
    const merged = stored ? { ...stored, ...payload } : payload;
    const missing = missingRequiredForPublish(hot, merged);
    if (missing.length > 0) {
      out.push({
        id: row.id,
        message: missing.map((f) => `Field '${f}' is required when publishing`).join("; "),
      });
    }
  }
}

/**
 * High-throughput multi-row insertion.
 */
export async function executeBulkCreate(
  ctx: BulkContext,
  collectionId: string,
  data: unknown[],
  options: LocalApiOptions = {},
): Promise<DatabaseResult<unknown[]>> {
  validateBulkPayloadSize(data.length, "bulkCreate");
  const { user, tenantId, system } = options;
  if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  const schema = await ctx.schemaOf(collectionId, tenantId);
  const hot = ensureSchemaHotFlags(schema);

  const effectiveUser = system ? { _id: "system", role: "admin" } : user;

  if (
    !system &&
    !isAdmin(user) &&
    (hot._hasGuardedFields ?? true) &&
    schema.fields &&
    schema.fields.length > 0
  ) {
    const { assertWriteAllowed } = await import("@src/services/security/field-permission-service");
    for (const item of data) {
      if (item && typeof item === "object") {
        await assertWriteAllowed(
          schema.fields as FieldInstance[],
          item as Record<string, unknown>,
          user,
          {
            collectionName: schema.name,
            tenantId: tenantId ?? undefined,
          },
        );
      }
    }
  }

  const now = nowISODateString();
  const createdBy = effectiveUser?._id;

  const entries: EntryData[] = data.map((item) => {
    let doc = item;
    if (doc && typeof doc === "object") {
      if (hot._hasConstrainedFields) {
        doc = prepareCollectionFields(
          doc as Record<string, unknown>,
          schema as Parameters<typeof prepareCollectionFields>[1],
          { constraints: true },
        );
      }
      return {
        ...(doc as Record<string, unknown>),
        tenantId,
        createdBy,
        createdAt: (doc as { createdAt?: string }).createdAt || now,
      } as EntryData;
    }
    return doc as EntryData;
  });

  if (hot._hasActiveWidgets) {
    await applyWidgetPipeline(schema, entries, {
      dbAdapter: ctx._dbAdapter,
      user: effectiveUser,
      type: "POST",
      tenantId,
      collectionName: schema.name,
      skipValidation: options.skipValidation,
      action: "bulkCreate",
      system,
    });
  }

  if (hot._hasEncryptedFields) {
    const encCtx = fieldEncryptionContext(schema, tenantId);
    for (let i = 0; i < entries.length; i++) {
      await encryptWritePayload(entries[i], hot, encCtx);
    }
  }

  let result: DatabaseResult<unknown[]>;
  const bulkOptions = { tenantId, ...options };
  if (ctx._dbAdapter.batch && typeof ctx._dbAdapter.batch.bulkInsert === "function") {
    result = (await ctx._dbAdapter.batch.bulkInsert(
      ctx.getCollectionName(schema._id as string),
      entries as EntityCreate<BaseEntity>[],
      bulkOptions,
    )) as DatabaseResult<unknown[]>;
  } else if (ctx._dbAdapter.crud && typeof ctx._dbAdapter.crud.insertMany === "function") {
    result = (await ctx._dbAdapter.crud.insertMany(
      ctx.getCollectionName(schema._id as string),
      entries as EntityCreate<BaseEntity>[],
      bulkOptions,
    )) as DatabaseResult<unknown[]>;
  } else {
    throw new Error("Adapter does not support bulk operations.");
  }

  if (result.success && !shouldSkipWriteSideEffects(options)) {
    if (!workflowKnownAbsent(schema._id as string, tenantId as string | undefined)) {
      try {
        const workflowService = await getWorkflowServiceLazy();
        const resultsData = Array.isArray(result.data)
          ? (result.data as Array<{ _id?: string }>)
          : [];
        const insertedIds = resultsData.map((d) => String(d._id ?? "")).filter(Boolean);
        await workflowService.bulkInitializeWorkflow(
          insertedIds,
          schema._id as string,
          tenantId as string,
        );
      } catch (error) {
        logger.debug("[collections-namespace] suppressed error", error);
      }
    }

    invalidateCache(schema, tenantId);
    try {
      const pubSub = await getPubSubLazy();
      pubSub.publish("entryUpdated", {
        collection: schema.name || (schema._id as string),
        id: "bulk",
        action: "bulkCreate",
        data: { count: entries.length },
        timestamp: nowISODateString(),
        tenantId,
        user,
      });
    } catch (error) {
      logger.debug("[collections-namespace] suppressed error", error);
    }
  }

  return result;
}

/**
 * Multi-row update with per-entry validation and homogenous batch optimization.
 */
export async function executeBulkUpdate(
  ctx: BulkContext,
  collectionId: string,
  updates: Array<{ id: string; data: Record<string, unknown> }>,
  options: LocalApiOptions = {},
): Promise<DatabaseResult<{ modifiedCount: number }>> {
  validateBulkPayloadSize(updates.length, "bulkUpdate");
  const { user, tenantId, system } = options;
  if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  const schema = await ctx.schemaOf(collectionId, tenantId);
  const hot = ensureSchemaHotFlags(schema);

  const scope = ownershipFilter(schema, user, system);
  if (scope === null) throw new AppError("Entry not found", 404, "NOT_FOUND");
  const access = getReadConstraint(schema.name || String(schema._id), {
    user,
    role: user?.role,
    tenantId: tenantId ? String(tenantId) : null,
  });
  const ownershipScope = scope === false ? null : scope;
  if ((ownershipScope || access) && updates.length > 0) {
    const field = ownershipScope ? Object.keys(ownershipScope)[0] : "";
    const ownerId = field && ownershipScope ? String(ownershipScope[field]) : "";
    const targetIds = updates.map((u) => u.id as DatabaseId);
    const found = await ctx._dbAdapter.crud.findByIds(
      ctx.getCollectionName(schema._id as string),
      targetIds,
      { tenantId: tenantId as DatabaseId, limit: targetIds.length },
    );
    const rows = found?.success && Array.isArray(found.data) ? found.data : [];
    const wanted = new Set(updates.map((u) => String(u.id)));
    let permitted = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as { _id?: unknown };
      if (!wanted.has(String(row?._id ?? ""))) continue;
      if (access && !rowMatchesConstraint(row, access)) continue;
      if (field) {
        const value = ownerValue(row, field);
        if (value === undefined || value === null || String(value) !== ownerId) continue;
      }
      permitted++;
    }
    if (permitted !== wanted.size) throw new AppError("Entry not found", 404, "NOT_FOUND");
  }

  if (
    !system &&
    !isAdmin(user) &&
    (hot._hasGuardedFields ?? true) &&
    schema.fields &&
    schema.fields.length > 0
  ) {
    const { assertWriteAllowed } = await import("@src/services/security/field-permission-service");
    for (const u of updates) {
      await assertWriteAllowed(
        schema.fields as FieldInstance[],
        (u.data ?? {}) as Record<string, unknown>,
        user,
        {
          collectionName: schema.name,
          entryId: u.id,
          tenantId: tenantId ?? undefined,
        },
      );
    }
  }

  const rejections: BulkRejection[] = [];
  if (updates.length > 0) {
    await collectBulkRejections(
      ctx,
      schema,
      hot,
      updates,
      { user, system, tenantId, options },
      rejections,
    );
  }
  assertBulkWriteValid(rejections, updates.length);

  const now = nowISODateString();
  const encCtx = hot._hasEncryptedFields ? fieldEncryptionContext(schema, tenantId) : undefined;
  const schemaHasUpdatedByField = (schema.fields ?? []).some(
    (f) => (f as { db_fieldName?: string }).db_fieldName === "updatedBy",
  );

  const formattedUpdates: Array<{ id: DatabaseId; data: Record<string, unknown> }> = [];
  for (const u of updates) {
    const raw = (u.data ?? {}) as Record<string, unknown>;
    const patched = isShallowPatch(raw)
      ? { ...raw }
      : (copyDataWithFreshRowIds(raw) as Record<string, unknown>);
    delete patched.tenantId;
    delete patched.createdBy;
    delete patched._scheduledBy;
    const data = {
      ...patched,
      ...(schemaHasUpdatedByField ? { updatedBy: user?._id } : {}),
      updatedAt: now,
    };
    if (encCtx) {
      const encrypted = encryptWritePayload(data, hot, encCtx);
      if (isThenable(encrypted)) await encrypted;
    }
    formattedUpdates.push({
      id: u.id as DatabaseId,
      data,
    });
  }

  const table = ctx.getCollectionName(schema._id as string);
  let result: DatabaseResult<{ modifiedCount: number }>;

  if (formattedUpdates.length > 0 && sameShallowPayload(formattedUpdates)) {
    result = await ctx._dbAdapter.crud.updateMany(
      table,
      { _id: { $in: formattedUpdates.map((u) => u.id) } } as QueryFilter<BaseEntity>,
      formattedUpdates[0].data as Partial<BaseEntity>,
      { tenantId: tenantId as DatabaseId },
    );
  } else {
    result = await ctx._dbAdapter.batch.bulkUpdate(table, formattedUpdates, {
      tenantId: tenantId as DatabaseId,
    });
  }

  if (result.success && !shouldSkipWriteSideEffects(options)) {
    invalidateCache(schema, tenantId, {
      writtenIds: formattedUpdates.map((u) => String(u.id)),
    });
  }

  return result;
}

/**
 * Multi-row delete with authorization, soft-delete, and permanent purge support.
 */
export async function executeBulkDelete(
  ctx: BulkContext,
  collectionId: string,
  ids: string[],
  options: LocalApiOptions & { permanent?: boolean } = {},
): Promise<DatabaseResult<{ deletedCount: number }>> {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError("entryIds[] is required for bulk delete", 400);
  }
  validateBulkPayloadSize(ids.length, "bulkDelete");
  const { user, tenantId } = options;
  if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  const schema = await ctx.schemaOf(collectionId, tenantId);
  if (schema?.disableBulkDelete) {
    throw new AppError(
      `Bulk delete is disabled for collection "${schema.name || collectionId}"`,
      403,
      "BULK_DELETE_DISABLED",
    );
  }

  const scope = ownershipFilter(schema, user, options.system);
  if (scope === null) throw new AppError("Entry not found", 404, "NOT_FOUND");
  const access = getReadConstraint(schema.name || String(schema._id), {
    user,
    role: user?.role,
    tenantId: tenantId ? String(tenantId) : null,
  });
  const ownershipScope = scope === false ? null : scope;
  if (ownershipScope || access) {
    const field = ownershipScope ? Object.keys(ownershipScope)[0] : "";
    const ownerId = field && ownershipScope ? String(ownershipScope[field]) : "";
    const found = await ctx._dbAdapter.crud.findByIds(
      ctx.getCollectionName(schema._id as string),
      ids as DatabaseId[],
      { tenantId: tenantId as DatabaseId, limit: ids.length },
    );
    const rows = found?.success && Array.isArray(found.data) ? found.data : [];
    const wanted = new Set(ids);
    let permitted = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as { _id?: unknown };
      if (!wanted.has(String(row?._id ?? ""))) continue;
      if (access && !rowMatchesConstraint(row, access)) continue;
      if (field) {
        const value = ownerValue(row, field);
        if (value === undefined || value === null || String(value) !== ownerId) continue;
      }
      permitted++;
    }
    if (permitted !== wanted.size) throw new AppError("Entry not found", 404, "NOT_FOUND");
  }

  const result = await ctx._dbAdapter.crud.deleteMany(
    ctx.getCollectionName(schema._id as string),
    { _id: { $in: ids as DatabaseId[] } } as QueryFilter<BaseEntity>,
    {
      tenantId: tenantId as DatabaseId,
      userId: user?._id as DatabaseId,
      permanent: options.permanent === true,
    },
  );

  if (result.success && !shouldSkipWriteSideEffects(options)) {
    invalidateCache(schema, tenantId, { writtenIds: ids });
  }

  return result;
}

/**
 * Raw id lookup — one `WHERE _id IN (...)` query without widget modifyRequest.
 */
export async function executeFindByIds(
  ctx: BulkContext,
  collectionId: string,
  ids: string[],
  options: LocalApiOptions = {},
): Promise<{ success: boolean; data: unknown[]; total?: number; message?: string }> {
  if (!ids.length) return { success: true, data: [] };
  const { tenantId } = options;
  const schema = await ctx.schemaOf(collectionId, tenantId);
  const result = await ctx._dbAdapter.crud.findByIds(
    ctx.getCollectionName(schema._id as string),
    ids as DatabaseId[],
    { tenantId: tenantId as DatabaseId, limit: ids.length },
  );
  const envelope = result?.success
    ? result
    : { success: false, data: [], message: (result as { message?: string })?.message };
  const hot = ensureSchemaHotFlags(schema);
  return presentRead(
    envelope,
    schema,
    hot,
    readEncryptionContext(schema, tenantId, hot),
    options.user,
    options.system,
  ) as { success: boolean; data: unknown[]; total?: number; message?: string };
}
