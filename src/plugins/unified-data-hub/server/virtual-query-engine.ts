/**
 * @file src/plugins/unified-data-hub/server/virtual-query-engine.ts
 * @description v1.0 passthrough executor with v1.5 planner + same-source joins.
 *
 * Responsibilities:
 * - Resolve virtual collection + connector
 * - Plan query via AST normalization (query-planner.ts)
 * - Same-source virtual joins (virtual-join.ts, Phase B)
 * - TTL cache for REST connectors
 * - Audit cross-source reads
 *
 * Features:
 * - No cross-source joins (v1.0)
 * - Same-source joins when joinable: same-source-only (v1.5)
 * - WordPress REST filter pushdown (v1.5)
 * - Per-connector circuit breaker on egress (v1.5)
 */

import type { DatabaseId, IDBAdapter } from "@databases/db-interface";
import { checkExtensionLicense } from "@src/utils/license-manager";
import type { FederatedRow, VirtualCollectionReadOptions, VirtualReadResult } from "../types";
import { FederationError } from "../types";
import { getConnectorById, getConnectorInstance, getVirtualCollection } from "./connector-registry";
import { getCachedVirtualRead, hashQuery, setCachedVirtualRead } from "./cache";
import { assertVirtualReadPermission } from "./permission-engine";
import { logFederationAccess } from "./audit";
import { planVirtualQuery, rejectHybridQuery, rejectMultiCollection } from "./query-planner";
import {
  assertJoinKeyBudget,
  buildInFilter,
  collectJoinKeys,
  mergeRelationIntoRows,
  resolveJoinTarget,
  resolveRelationsToInclude,
} from "./virtual-join";
import { isCrossSourceAlphaEnabled } from "./cross-source-alpha";
import { computeJoinTelemetry } from "./stitch-telemetry";
import {
  annotateDecompositionForAlpha,
  assertDecompositionExecutable,
  buildDecompositionPlan,
} from "./federated-decomposition";
import { buildNextCursor, resolveCursorOffset } from "./federated-cursor";

export { rejectHybridQuery, rejectMultiCollection };

export async function executeVirtualRead(
  db: IDBAdapter,
  collectionId: string,
  options: VirtualCollectionReadOptions = {},
  roles: unknown[] = [],
): Promise<VirtualReadResult> {
  const tenantId = String(options.tenantId ?? "default") as DatabaseId;

  const license = await checkExtensionLicense("plugin", "unified-data-hub");
  if (!license.active && !license.hasLicense) {
    throw new FederationError(
      "LICENSE_REQUIRED",
      "Unified Data Hub license or trial required",
      403,
    );
  }

  const collection = await getVirtualCollection(db, collectionId, tenantId);
  if (!collection || !collection.enabled) {
    throw new FederationError(
      "COLLECTION_NOT_FOUND",
      `Virtual collection not found: ${collectionId}`,
      404,
    );
  }

  await assertVirtualReadPermission(options.user, roles, collection);

  const connector = await getConnectorById(db, collection.connectorId, tenantId);
  if (!connector || !connector.enabled) {
    throw new FederationError(
      "CONNECTOR_NOT_FOUND",
      `Connector not found: ${collection.connectorId}`,
      404,
    );
  }

  const includeRelations = resolveRelationsToInclude(collection, options.include);
  const joinTargets = await Promise.all(
    includeRelations.map(async (relation) => {
      const targetCollection = await getVirtualCollection(db, relation.targetSlug, tenantId);
      if (!targetCollection) {
        throw new FederationError(
          "COLLECTION_NOT_FOUND",
          `Join target collection not found: ${relation.targetSlug}`,
          404,
        );
      }
      const targetConnector = await getConnectorById(db, targetCollection.connectorId, tenantId);
      if (!targetConnector) {
        throw new FederationError(
          "CONNECTOR_NOT_FOUND",
          `Connector not found: ${targetCollection.connectorId}`,
          404,
        );
      }
      return { relation, collection: targetCollection, connector: targetConnector };
    }),
  );

  const crossSourceAlpha = await isCrossSourceAlphaEnabled(tenantId);

  const decomposition = annotateDecompositionForAlpha(
    buildDecompositionPlan({
      primary: collection,
      primaryConnector: connector,
      options,
      joinTargets,
    }),
    crossSourceAlpha,
  );
  assertDecompositionExecutable(decomposition, { crossSourceAlpha });

  const cursorOffset = resolveCursorOffset(options, collection.slug, String(connector._id));
  const readOptions: VirtualCollectionReadOptions = {
    ...options,
    offset: cursorOffset,
  };

  const planned = planVirtualQuery(readOptions, collection, connector);

  const queryHash = hashQuery({
    filter: options.filter,
    sort: options.sort,
    limit: planned.ast.limit,
    offset: planned.ast.offset,
    select: options.select,
    include: options.include,
  });

  const ttl = connector.capabilities.ttlSeconds ?? 60;
  const useCache =
    !options.bypassCache &&
    planned.effectiveCapabilities.staleness === "cache" &&
    includeRelations.length === 0;
  if (useCache) {
    const cached = getCachedVirtualRead(tenantId, String(collection._id), queryHash);
    if (cached) return cached;
  }

  const instance = getConnectorInstance(connector.type);
  let rows: FederatedRow[];
  let total: number | undefined;

  const primary = await instance.executeRead({
    connector,
    collection,
    request: planned.request,
    restQueryParams: planned.restQueryParams,
    clientFilters: planned.clientFilters,
  });
  rows = primary.rows;
  total = primary.total;

  let joinTelemetry: ReturnType<typeof computeJoinTelemetry> | undefined;

  if (includeRelations.length > 0) {
    for (const relation of includeRelations) {
      const resolved = await resolveJoinTarget(db, tenantId, collection, relation, connector, {
        allowCrossSource: crossSourceAlpha,
      });
      const target = resolved.collection;
      const joinConnector = resolved.connector;
      const joinInstance = getConnectorInstance(joinConnector.type);

      const joinKeys = collectJoinKeys(rows, relation.localField);
      assertJoinKeyBudget(joinKeys.length);
      joinTelemetry = computeJoinTelemetry(joinKeys.length);

      if (joinKeys.length === 0) {
        rows = mergeRelationIntoRows(
          rows,
          relation.name,
          relation.localField,
          relation.foreignField,
          [],
        );
        continue;
      }

      const joinPlanned = planVirtualQuery(
        {
          tenantId,
          filter: buildInFilter(relation.foreignField, joinKeys, target),
          limit: joinKeys.length,
          bypassCache: true,
          user: options.user,
        },
        target,
        joinConnector,
      );

      const related = await joinInstance.executeRead({
        connector: joinConnector,
        collection: target,
        request: joinPlanned.request,
        restQueryParams: joinPlanned.restQueryParams,
        clientFilters: joinPlanned.clientFilters,
      });

      rows = mergeRelationIntoRows(
        rows,
        relation.name,
        relation.localField,
        relation.foreignField,
        related.rows,
      );
    }
  }

  const result: VirtualReadResult = {
    data: rows,
    total,
    meta: {
      connectorId: connector._id,
      staleness: planned.effectiveCapabilities.staleness === "cache" ? "cache" : "real-time",
      clamped: planned.ast.clamped,
      included: includeRelations.length > 0 ? includeRelations.map((r) => r.name) : undefined,
      ...(joinTelemetry
        ? {
            stitchWarning: joinTelemetry.stitchWarning,
            nearBudget: joinTelemetry.nearBudget,
            warningCode: joinTelemetry.warningCode,
            joinKeyCount: joinTelemetry.keyCount,
            joinBudget: joinTelemetry.budget,
          }
        : {}),
      decomposition: {
        version: decomposition.version,
        crossSource: decomposition.crossSource,
        subExpressionCount: decomposition.subExpressions.length,
        mergeStrategy: decomposition.mergeStrategy,
        cursorModel: decomposition.cursorModel,
      },
      nextCursor: buildNextCursor({
        slug: collection.slug,
        connectorId: String(connector._id),
        currentOffset: cursorOffset,
        rowCount: rows.length,
        total,
        limit: planned.ast.limit,
      }),
      cursorOffset,
    },
  };

  if (useCache && planned.effectiveCapabilities.staleness === "cache" && ttl > 0) {
    setCachedVirtualRead(tenantId, String(collection._id), queryHash, result, ttl);
  }

  await logFederationAccess(db, {
    tenantId,
    userId: options.user?._id,
    collectionId: collection._id,
    connectorId: connector._id,
    action: "read",
    meta: {
      rowCount: rows.length,
      clamped: planned.ast.clamped,
      included: result.meta.included,
      stitchWarning: result.meta.stitchWarning,
      nearBudget: result.meta.nearBudget,
      joinKeyCount: result.meta.joinKeyCount,
      decomposition: result.meta.decomposition,
    },
  });

  return result;
}

export async function executeVirtualFindById(
  db: IDBAdapter,
  collectionId: string,
  entryId: string,
  options: VirtualCollectionReadOptions = {},
  roles: unknown[] = [],
): Promise<{ data: VirtualReadResult["data"][0] | null }> {
  const result = await executeVirtualRead(db, collectionId, { ...options, limit: 100 }, roles);
  const row = result.data.find((r) => r._id === entryId || r._source.sourceKey === entryId);
  return { data: row ?? null };
}
