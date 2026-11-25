/**
 * @file src/services/sdk/namespaces/collections/relation-integrity.ts
 * @description Referential integrity enforcement (`cascade`, `setNull`, `restrict`)
 * across Relation fields on entry delete, bounded to MAX_RELATIONAL_ON_DELETE_FANOUT = 100.
 *
 * Features:
 * - Zero overhead for collections without inbound `onDelete` relation declarations
 * - Pre-delete `restrict` check returning HTTP 409 `RELATION_RESTRICT_CONFLICT`
 * - Post-delete bounded `setNull` (unlinks single or multi-relation fields) and `cascade`
 * - Cycle-safe recursive cascade tracking (`visited` set + fanout ceiling 100)
 */

import { raise } from "@utils/error-handling";
import { logger } from "@utils/logger";
import type { FieldInstance, Schema } from "@src/content/types";
import type { BaseEntity, DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { RelationOnDeleteAction } from "@src/widgets/core/relation/types";
import { schemaCacheEntries } from "./schema-store";

export const MAX_RELATIONAL_ON_DELETE_FANOUT = 100;

export interface InboundRelationRule {
  sourceSchema: Schema;
  fieldName: string;
  multiple: boolean;
  onDelete: RelationOnDeleteAction;
}

function getRelationTarget(field: FieldInstance): string | undefined {
  const widgetProps = (field.widget as { props?: Record<string, unknown> } | undefined)?.props;
  const target =
    (field as { collection?: unknown; relation?: unknown }).collection ??
    (field as { relation?: unknown }).relation ??
    widgetProps?.collection ??
    widgetProps?.relation;
  return typeof target === "string" && target.trim().length > 0 ? target.trim() : undefined;
}

function getRelationOnDelete(field: FieldInstance): RelationOnDeleteAction | undefined {
  const widgetProps = (field.widget as { props?: Record<string, unknown> } | undefined)?.props;
  const raw = (field as { onDelete?: unknown }).onDelete ?? widgetProps?.onDelete;
  if (raw === "cascade" || raw === "setNull" || raw === "restrict") return raw;
  return undefined;
}

function isRelationField(field: FieldInstance): boolean {
  const wName = field.widget?.Name;
  return (
    wName === "Relation" ||
    wName === "RelationList" ||
    Boolean((field as { relation?: unknown }).relation) ||
    Boolean(getRelationTarget(field) && getRelationOnDelete(field))
  );
}

function isMultipleRelation(field: FieldInstance): boolean {
  const widgetProps = (field.widget as { props?: Record<string, unknown> } | undefined)?.props;
  if (field.widget?.Name === "RelationList") return true;
  return Boolean((field as { multiple?: unknown }).multiple ?? widgetProps?.multiple);
}

function schemaMatchesTarget(targetSchema: Schema, targetRef: string): boolean {
  const needle = targetRef.toLowerCase();
  const id = targetSchema._id ? String(targetSchema._id).toLowerCase() : "";
  const name = targetSchema.name ? String(targetSchema.name).toLowerCase() : "";
  const slug = targetSchema.slug ? String(targetSchema.slug).toLowerCase() : "";
  return needle === id || needle === name || needle === slug;
}

/**
 * Collect all unique schemas currently loaded in memory alongside any explicitly
 * supplied candidate schemas.
 */
export function resolveCandidateSchemas(explicitSchemas?: readonly Schema[]): Schema[] {
  const byKey = new Map<string, Schema>();
  const add = (schema: Schema | null | undefined) => {
    if (!schema) return;
    const key = String(schema._id || schema.name || "").toLowerCase();
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, schema);
  };
  if (explicitSchemas) {
    for (const s of explicitSchemas) add(s);
  }
  for (const [, s] of schemaCacheEntries()) add(s);
  return Array.from(byKey.values());
}

/** Discover inbound relation fields referencing `targetSchema` that declare `onDelete`. */
export function collectInboundRelationRules(
  targetSchema: Schema,
  candidateSchemas?: readonly Schema[],
): InboundRelationRule[] {
  const schemas = resolveCandidateSchemas(candidateSchemas);
  const rules: InboundRelationRule[] = [];
  for (const sourceSchema of schemas) {
    const fields = (sourceSchema.fields || []) as FieldInstance[];
    for (const field of fields) {
      if (!isRelationField(field)) continue;
      const onDelete = getRelationOnDelete(field);
      if (!onDelete) continue;
      const targetRef = getRelationTarget(field);
      if (!targetRef || !schemaMatchesTarget(targetSchema, targetRef)) continue;
      const fieldName = field.db_fieldName || (field as { name?: string }).name;
      if (!fieldName) continue;
      rules.push({
        sourceSchema,
        fieldName,
        multiple: isMultipleRelation(field),
        onDelete,
      });
    }
  }
  return rules;
}

async function findReferencingRows(
  adapter: IDBAdapter,
  tableName: string,
  fieldName: string,
  entryId: string,
  tenantId: DatabaseId | null | undefined,
  limit: number,
  transaction?: unknown,
): Promise<Array<BaseEntity & Record<string, unknown>>> {
  const res = await adapter.crud.findMany<BaseEntity & Record<string, unknown>>(
    tableName,
    { [fieldName]: entryId } as never,
    {
      tenantId: (tenantId || undefined) as DatabaseId | undefined,
      limit,
      skipMeta: true,
      ...(transaction ? { transaction } : {}),
    } as never,
  );
  if (res.success && Array.isArray(res.data) && res.data.length > 0) {
    return res.data;
  }

  // Fallback for multi-value JSON arrays stored inside flat SQL or document rows
  const resIn = await adapter.crud.findMany<BaseEntity & Record<string, unknown>>(
    tableName,
    { [fieldName]: { $in: [entryId] } } as never,
    {
      tenantId: (tenantId || undefined) as DatabaseId | undefined,
      limit,
      skipMeta: true,
      ...(transaction ? { transaction } : {}),
    } as never,
  );
  if (resIn.success && Array.isArray(resIn.data)) {
    return resIn.data;
  }
  return [];
}

/**
 * Run pre-delete referential integrity checks (`restrict` blocks with 409 before
 * the parent row is removed). Returns the discovered inbound rules for reuse in
 * the post-delete phase without re-scanning schemas.
 */
export async function enforceOnDeleteBeforeDelete(params: {
  adapter: IDBAdapter;
  targetSchema: Schema;
  entryId: string;
  getCollectionName: (schemaId: string) => string;
  tenantId?: DatabaseId | null;
  candidateSchemas?: readonly Schema[];
  transaction?: unknown;
}): Promise<InboundRelationRule[]> {
  const rules = collectInboundRelationRules(params.targetSchema, params.candidateSchemas);
  if (rules.length === 0) return rules;

  for (const rule of rules) {
    if (rule.onDelete !== "restrict") continue;
    const sourceTable = params.getCollectionName(
      String(rule.sourceSchema._id || rule.sourceSchema.name),
    );
    const hits = await findReferencingRows(
      params.adapter,
      sourceTable,
      rule.fieldName,
      params.entryId,
      params.tenantId,
      1,
      params.transaction,
    );
    if (hits.length > 0) {
      raise(
        409,
        `Cannot delete entry '${params.entryId}' in '${String(params.targetSchema.name || params.targetSchema._id)}' because referencing entries exist in '${String(rule.sourceSchema.name || rule.sourceSchema._id)}.${rule.fieldName}'.`,
        "RELATION_RESTRICT_CONFLICT",
      );
    }
  }
  return rules;
}

/**
 * Apply post-delete `setNull` and bounded `cascade` actions across inbound relations.
 * Caps total cascade/unlink operations at `MAX_RELATIONAL_ON_DELETE_FANOUT` (100)
 * and prevents cyclic loops via a visited key set.
 */
export async function applyOnDeleteAfterDelete(params: {
  adapter: IDBAdapter;
  targetSchema: Schema;
  entryId: string;
  getCollectionName: (schemaId: string) => string;
  tenantId?: DatabaseId | null;
  permanent?: boolean;
  rules?: InboundRelationRule[];
  candidateSchemas?: readonly Schema[];
  transaction?: unknown;
  visited?: Set<string>;
  budget?: { remaining: number };
}): Promise<{ cascaded: number; unlinked: number }> {
  const rules =
    params.rules ?? collectInboundRelationRules(params.targetSchema, params.candidateSchemas);
  if (rules.length === 0) return { cascaded: 0, unlinked: 0 };

  const targetKey = `${String(params.targetSchema._id || params.targetSchema.name)}:${params.entryId}`;
  const visited = params.visited ?? new Set<string>();
  if (visited.has(targetKey)) return { cascaded: 0, unlinked: 0 };
  visited.add(targetKey);

  const budget = params.budget ?? { remaining: MAX_RELATIONAL_ON_DELETE_FANOUT };
  const candidateSchemas = resolveCandidateSchemas(params.candidateSchemas);
  let cascaded = 0;
  let unlinked = 0;

  for (const rule of rules) {
    if (rule.onDelete === "restrict" || budget.remaining <= 0) continue;
    const sourceId = String(rule.sourceSchema._id || rule.sourceSchema.name);
    const sourceTable = params.getCollectionName(sourceId);
    const rows = await findReferencingRows(
      params.adapter,
      sourceTable,
      rule.fieldName,
      params.entryId,
      params.tenantId,
      budget.remaining,
      params.transaction,
    );
    if (rows.length === 0) continue;

    for (const row of rows) {
      if (budget.remaining <= 0) {
        logger.warn(
          `[RelationIntegrity] Reached fanout cap (${MAX_RELATIONAL_ON_DELETE_FANOUT}) while cleaning up ${targetKey}`,
        );
        break;
      }
      const rowId = row._id ? String(row._id) : "";
      if (!rowId) continue;

      if (rule.onDelete === "setNull") {
        const currentVal = row[rule.fieldName];
        const nextVal = Array.isArray(currentVal)
          ? currentVal.filter((item) => String(item) !== params.entryId)
          : null;
        await params.adapter.crud.update(
          sourceTable,
          rowId as DatabaseId,
          { [rule.fieldName]: nextVal } as never,
          {
            tenantId: (params.tenantId || undefined) as DatabaseId | undefined,
            ...(params.transaction ? { transaction: params.transaction } : {}),
          } as never,
        );
        budget.remaining--;
        unlinked++;
      } else if (rule.onDelete === "cascade") {
        const childKey = `${sourceId}:${rowId}`;
        if (visited.has(childKey)) continue;
        await params.adapter.crud.delete(
          sourceTable,
          rowId as DatabaseId,
          {
            tenantId: (params.tenantId || undefined) as DatabaseId | undefined,
            permanent: params.permanent === true,
            ...(params.transaction ? { transaction: params.transaction } : {}),
          } as never,
        );
        budget.remaining--;
        cascaded++;
        const sub = await applyOnDeleteAfterDelete({
          adapter: params.adapter,
          targetSchema: rule.sourceSchema,
          entryId: rowId,
          getCollectionName: params.getCollectionName,
          tenantId: params.tenantId,
          permanent: params.permanent,
          candidateSchemas,
          transaction: params.transaction,
          visited,
          budget,
        });
        cascaded += sub.cascaded;
        unlinked += sub.unlinked;
      }
    }
  }

  return { cascaded, unlinked };
}
