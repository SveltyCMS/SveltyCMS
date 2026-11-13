/**
 * @file src/services/sdk/namespaces/collections/junction-fields.ts
 * @description Junction (many-to-many) field planning for collection writes/reads.
 *
 * A `ManyToMany` field is not stored in the document. The write path extracts
 * its desired edges, strips the field from the row payload, writes the row, and
 * syncs the edges into the junction table. The read path hydrates the field
 * back onto each row as an ordered id array, plus the per-link data when any
 * edge carries metadata.
 *
 * ### Features:
 * - per-schema compiled field plan (WeakMap, no per-write field scan)
 * - payload extraction that strips only the fields the request supplied
 * - batched read hydration for a whole page
 * - cascades for deleted sources and deleted targets
 */

import type { Schema } from "@src/content/types";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import {
  deleteSourceLinks,
  deleteTargetLinks,
  getSourceLinks,
  normalizeLinkInputs,
  syncSourceLinks,
  type JunctionLinkDescriptor,
} from "@src/services/core/relation-link-service";
import { logger } from "@utils/logger";
import { raise } from "@utils/error-handling";

export interface JunctionFieldPlan {
  fieldName: string;
  targetCollection: string;
  through: string;
}

const planCache = new WeakMap<Schema, JunctionFieldPlan[]>();
/**
 * Target collections that at least one loaded schema links to. Registered when a
 * junction field is planned, so the delete path can tell a target-side cascade
 * apart from an ordinary collection without a query (the reverse lookup is an
 * indexed read, not a scan).
 */
const knownTargets = new Set<string>();

function widgetNameOf(field: Record<string, unknown>): string {
  const widget = field.widget;
  if (typeof widget === "string") return widget;
  if (widget && typeof widget === "object") {
    const record = widget as Record<string, unknown>;
    if (typeof record.Name === "string") return record.Name;
    if (typeof record.name === "string") return record.name;
  }
  return typeof field.type === "string" ? field.type : "";
}

function isManyToMany(field: Record<string, unknown>): boolean {
  const name = widgetNameOf(field);
  return name === "ManyToMany" || name === "many-to-many" || name === "m2m";
}

/** Compiled list of the schema's junction fields (empty array when none). */
export function junctionFieldsOf(schema: Schema): JunctionFieldPlan[] {
  const cached = planCache.get(schema);
  if (cached) return cached;

  const plans: JunctionFieldPlan[] = [];
  for (const entry of (schema.fields ?? []) as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const field = entry as Record<string, unknown>;
    if (!isManyToMany(field)) continue;
    const fieldName = String(field.db_fieldName ?? field.name ?? field.label ?? "");
    const targetCollection = String(field.collection ?? field.relation ?? "");
    if (!fieldName || !targetCollection) continue;
    plans.push({
      fieldName,
      targetCollection,
      through: String(field.through ?? "contentRelations"),
    });
  }
  planCache.set(schema, plans);
  for (const plan of plans) knownTargets.add(plan.targetCollection);
  return plans;
}

export interface JunctionPayload {
  /** Fields present in this request, with their desired edges. */
  present: JunctionLinkDescriptor[];
  /** The payload without the junction fields (the row store never sees them). */
  stripped: Record<string, unknown>;
}

/**
 * Extract the junction fields the payload actually supplied and remove them
 * from the row. An update that omits the field leaves its edges untouched.
 */
export function collectJunctionPayload(
  schema: Schema,
  data: Record<string, unknown>,
): JunctionPayload {
  const plans = junctionFieldsOf(schema);
  if (plans.length === 0) return { present: [], stripped: data };

  let stripped = data;
  const present: JunctionLinkDescriptor[] = [];
  for (const plan of plans) {
    if (!Object.hasOwn(data, plan.fieldName)) continue;
    present.push({
      fieldName: plan.fieldName,
      targetCollection: plan.targetCollection,
      through: plan.through,
      desired: normalizeLinkInputs(data[plan.fieldName]),
    });
    if (stripped === data) stripped = { ...data };
    delete stripped[plan.fieldName];
  }
  return { present, stripped };
}

/** Persist the extracted edges for one written row. */
export async function syncJunctionLinks(
  adapter: IDBAdapter,
  params: {
    tenantId?: DatabaseId | null;
    sourceCollection: string;
    sourceId: string;
    links: readonly JunctionLinkDescriptor[];
    transaction?: unknown;
  },
): Promise<void> {
  if (params.links.length === 0) return;
  await syncSourceLinks(adapter, {
    tenantId: params.tenantId,
    sourceCollection: params.sourceCollection,
    sourceId: params.sourceId,
    links: params.links,
    transaction: params.transaction,
  });
}

/** Hydrate junction fields onto read rows (list or detail). */
export async function hydrateJunctionFields(
  adapter: IDBAdapter,
  schema: Schema,
  items: readonly Record<string, unknown>[],
  tenantId?: DatabaseId | null,
): Promise<void> {
  const plans = junctionFieldsOf(schema);
  if (plans.length === 0 || items.length === 0) return;

  const sourceIds = items
    .map((item) => (item._id === undefined || item._id === null ? "" : String(item._id)))
    .filter(Boolean);
  if (sourceIds.length === 0) return;

  for (const plan of plans) {
    const links = await getSourceLinks(adapter, {
      tenantId,
      sourceCollection: String(schema._id),
      fieldName: plan.fieldName,
      sourceIds,
      through: plan.through,
    });
    const metaKey = `_relation_${plan.fieldName}`;
    for (const item of items) {
      const id = item._id === undefined || item._id === null ? "" : String(item._id);
      const rows = links.get(id) ?? [];
      item[plan.fieldName] = rows.map((row) => row.targetId);
      // Only pay for the extra array when a link actually carries metadata.
      if (rows.some((row) => row.metadata && Object.keys(row.metadata).length > 0)) {
        item[metaKey] = rows.map((row) => ({
          id: row.targetId,
          sort: row.sortOrder,
          metadata: row.metadata ?? null,
        }));
      }
    }
  }
}

/**
 * Bulk create/update cannot sync junction edges (they bypass the single-entry
 * write path). Fail closed with a clear message instead of persisting the field
 * as an array and silently diverging from the junction store.
 */
export function assertBulkSupportsJunctionFields(
  schema: Schema,
  payloads: readonly unknown[],
  operation: "create" | "update",
): void {
  const plans = junctionFieldsOf(schema);
  if (plans.length === 0) return;
  const names = new Set(plans.map((plan) => plan.fieldName));
  for (const payload of payloads) {
    if (!payload || typeof payload !== "object") continue;
    const candidates = [payload as Record<string, unknown>];
    const nested = (payload as { data?: unknown }).data;
    if (nested && typeof nested === "object") candidates.push(nested as Record<string, unknown>);
    for (const record of candidates) {
      for (const name of names) {
        if (Object.hasOwn(record, name)) {
          raise(
            400,
            `Bulk ${operation} does not support the many-to-many field "${name}" on "${String(
              schema._id,
            )}"; use the single-entry endpoint.`,
            "JUNCTION_FIELD_BULK_UNSUPPORTED",
          );
        }
      }
    }
  }
}

/**
 * Cascade a deleted entry: drop the edges it owns as a source, and the edges
 * that point at it as a target. Best-effort per side: a failure is logged and
 * the delete still returns success (the row is already gone).
 */
export async function deleteJunctionLinksForEntry(
  adapter: IDBAdapter,
  schema: Schema,
  entryId: string,
  tenantId?: DatabaseId | null,
  transaction?: unknown,
): Promise<void> {
  const collectionId = String(schema._id);
  const plans = junctionFieldsOf(schema);
  const isSource = plans.length > 0;
  const isTarget = knownTargets.has(collectionId);
  // Ordinary collections cost nothing: neither side participates in a junction.
  if (!isSource && !isTarget) return;
  try {
    if (isSource) {
      const through = plans[0]?.through;
      await deleteSourceLinks(adapter, {
        tenantId,
        sourceCollection: collectionId,
        sourceId: entryId,
        through,
        transaction,
      });
    }
    if (isTarget) {
      await deleteTargetLinks(adapter, {
        tenantId,
        targetCollection: collectionId,
        targetId: entryId,
        transaction,
      });
    }
  } catch (err) {
    logger.warn(
      `[RelationLinks] Could not cascade links for ${collectionId}:${entryId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
