/**
 * @file src/plugins/unified-data-hub/server/virtual-join.ts
 * @description v1.5 Phase B — same-source virtual collection joins (in-memory merge).
 *
 * Allows virtual–virtual relations only when both collections share one connector
 * and `joinable: "same-source-only"`. Merges related rows into `_relations` on
 * each primary row with a configurable row budget cap.
 *
 * Features:
 * - Same-connector validation
 * - Schema field validation on both sides
 * - Hash-join merge with MAX_JOIN_ROW_BUDGET
 */

import type { DatabaseId, IDBAdapter } from "@databases/db-interface";
import type {
  ConnectorRecord,
  FederatedRow,
  VirtualCollectionRecord,
  VirtualRelation,
} from "../types";
import { FederationError } from "../types";
import { getVirtualCollection } from "./connector-registry";
export const MAX_JOIN_ROW_BUDGET = 500;
export const MAX_INCLUDE_RELATIONS = 5;

export function validateJoinCapability(connector: ConnectorRecord): void {
  if (connector.capabilities.joinable !== "same-source-only") {
    throw new FederationError(
      "FEDERATION_JOIN_NOT_SUPPORTED",
      "Connector does not support same-source virtual joins",
      400,
    );
  }
}

export function resolveRelationsToInclude(
  collection: VirtualCollectionRecord,
  include?: string[],
): VirtualRelation[] {
  if (!include?.length) return [];

  if (!collection.relations?.length) {
    throw new FederationError(
      "FEDERATION_JOIN_NOT_SUPPORTED",
      `Collection '${collection.slug}' has no relations defined`,
      400,
    );
  }

  if (include.length > MAX_INCLUDE_RELATIONS) {
    throw new FederationError(
      "FEDERATION_JOIN_BUDGET_EXCEEDED",
      `Maximum ${MAX_INCLUDE_RELATIONS} relations per request`,
      400,
    );
  }

  const byName = new Map(collection.relations.map((r) => [r.name, r]));
  const resolved: VirtualRelation[] = [];

  for (const name of include) {
    const rel = byName.get(name);
    if (!rel) {
      throw new FederationError(
        "FEDERATION_JOIN_NOT_SUPPORTED",
        `Unknown relation '${name}' on collection '${collection.slug}'`,
        400,
      );
    }
    resolved.push(rel);
  }

  return resolved;
}

function assertFieldOnCollection(
  collection: VirtualCollectionRecord,
  fieldName: string,
  label: string,
): void {
  const found = collection.fields.some((f) => f.name === fieldName || f.sourceField === fieldName);
  if (!found) {
    throw new FederationError(
      "FEDERATION_JOIN_NOT_SUPPORTED",
      `${label} field '${fieldName}' not found on collection '${collection.slug}'`,
      400,
    );
  }
}

export interface ResolvedJoinTarget {
  collection: VirtualCollectionRecord;
  connector: ConnectorRecord;
  crossSource: boolean;
}

export async function resolveJoinTarget(
  db: IDBAdapter,
  tenantId: DatabaseId,
  primary: VirtualCollectionRecord,
  relation: VirtualRelation,
  primaryConnector: ConnectorRecord,
  options?: { allowCrossSource?: boolean },
): Promise<ResolvedJoinTarget> {
  const target = await getVirtualCollection(db, relation.targetSlug, tenantId);
  if (!target || !target.enabled) {
    throw new FederationError(
      "COLLECTION_NOT_FOUND",
      `Join target collection not found: ${relation.targetSlug}`,
      404,
    );
  }

  const crossSource = target.connectorId !== primary.connectorId;

  if (crossSource) {
    if (!options?.allowCrossSource) {
      throw new FederationError(
        "FEDERATION_JOIN_NOT_SUPPORTED",
        "Cross-source virtual joins are not supported",
        400,
      );
    }
  } else {
    validateJoinCapability(primaryConnector);
  }

  const targetConnector = crossSource
    ? await resolveConnectorForCollection(db, target, tenantId)
    : primaryConnector;

  assertFieldOnCollection(primary, relation.localField, "Relation local");
  assertFieldOnCollection(target, relation.foreignField, "Relation foreign");

  return { collection: target, connector: targetConnector, crossSource };
}

async function resolveConnectorForCollection(
  db: IDBAdapter,
  collection: VirtualCollectionRecord,
  tenantId: DatabaseId,
): Promise<ConnectorRecord> {
  const { getConnectorById } = await import("./connector-registry");
  const connector = await getConnectorById(db, collection.connectorId, tenantId);
  if (!connector || !connector.enabled) {
    throw new FederationError(
      "CONNECTOR_NOT_FOUND",
      `Connector not found: ${collection.connectorId}`,
      404,
    );
  }
  return connector;
}

/** @deprecated Use resolveJoinTarget — same-source only */
export async function resolveSameSourceJoinTarget(
  db: IDBAdapter,
  tenantId: DatabaseId,
  primary: VirtualCollectionRecord,
  relation: VirtualRelation,
  connector: ConnectorRecord,
): Promise<VirtualCollectionRecord> {
  const resolved = await resolveJoinTarget(db, tenantId, primary, relation, connector);
  return resolved.collection;
}

export function collectJoinKeys(rows: FederatedRow[], localField: string): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    const value = row[localField];
    if (value !== undefined && value !== null && value !== "") {
      keys.add(String(value));
    }
  }
  return [...keys];
}

export function buildInFilter(
  foreignField: string,
  keys: string[],
  target: VirtualCollectionRecord,
): Record<string, unknown> {
  const field = target.fields.find(
    (f) => f.name === foreignField || f.sourceField === foreignField,
  );
  const key = field?.sourceField ?? foreignField;
  return { [key]: keys };
}

export function filterRowsByIn(
  rows: FederatedRow[],
  foreignField: string,
  keys: string[],
): FederatedRow[] {
  const keySet = new Set(keys.map(String));
  return rows.filter((row) => {
    const value = row[foreignField] ?? row._source.sourceKey;
    return keySet.has(String(value));
  });
}

export function mergeRelationIntoRows(
  primaryRows: FederatedRow[],
  relationName: string,
  localField: string,
  foreignField: string,
  relatedRows: FederatedRow[],
): FederatedRow[] {
  const index = new Map<string, FederatedRow>();
  for (const row of relatedRows) {
    const key = String(row[foreignField] ?? row._source.sourceKey);
    if (!index.has(key)) index.set(key, row);
  }

  return primaryRows.map((row) => {
    const localKey = String(row[localField] ?? "");
    const related = localKey ? (index.get(localKey) ?? null) : null;
    return {
      ...row,
      _relations: {
        ...row._relations,
        [relationName]: related,
      },
    };
  });
}

export function assertJoinKeyBudget(keyCount: number): void {
  if (keyCount > MAX_JOIN_ROW_BUDGET) {
    throw new FederationError(
      "FEDERATION_JOIN_BUDGET_EXCEEDED",
      `Join key budget exceeded (${keyCount} > ${MAX_JOIN_ROW_BUDGET})`,
      400,
    );
  }
}

export { applyInFilters } from "./in-filter-utils";
