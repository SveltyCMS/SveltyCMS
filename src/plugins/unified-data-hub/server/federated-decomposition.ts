/**
 * @file src/plugins/unified-data-hub/server/federated-decomposition.ts
 * @description v3.0 stable — federated query decomposition tree (plan-only for cross-source).
 *
 * Builds a multi-sub-expression plan for observability and future cross-source routing.
 * Execution remains single-source passthrough until v3 merge strategies land.
 *
 * Features:
 * - Per-connector sub-expression routing metadata
 * - Cross-source detection (fail-closed at execution)
 * - Cursor-per-source pagination model annotation
 */

import type {
  ConnectorRecord,
  ConnectorType,
  VirtualCollectionReadOptions,
  VirtualCollectionRecord,
  VirtualRelation,
} from "../types";
import { FederationError } from "../types";
import type { FederatedQueryAST, PlannedVirtualQuery } from "./query-planner";
import { planVirtualQuery } from "./query-planner";

export type MergeStrategy = "passthrough" | "hash-join" | "nested-loop" | "materialized";

export type FederatedCursorModel = "none" | "per-source";

export interface FederatedSubExpression {
  id: string;
  connectorId: string;
  collectionSlug: string;
  connectorType: ConnectorType;
  filterCount: number;
  hasSort: boolean;
  limit: number;
  offset: number;
  pushdown: boolean;
}

export interface FederatedDecompositionPlan {
  version: "3.0-stable";
  crossSource: boolean;
  subExpressions: FederatedSubExpression[];
  mergeStrategy: MergeStrategy;
  cursorModel: FederatedCursorModel;
  blockedReason?: string;
}

function snapshotSubExpression(
  id: string,
  collection: VirtualCollectionRecord,
  connector: ConnectorRecord,
  planned: PlannedVirtualQuery,
): FederatedSubExpression {
  const pushdown =
    planned.effectiveCapabilities.filterPushdown || planned.effectiveCapabilities.sortPushdown;
  return {
    id,
    connectorId: String(connector._id),
    collectionSlug: collection.slug,
    connectorType: connector.type,
    filterCount: planned.ast.filters.length,
    hasSort: planned.ast.sort !== null,
    limit: planned.ast.limit,
    offset: planned.ast.offset,
    pushdown,
  };
}

export function detectCrossSourceConnectors(connectorIds: string[]): boolean {
  const unique = new Set(connectorIds.filter(Boolean));
  return unique.size > 1;
}

export function buildDecompositionPlan(args: {
  primary: VirtualCollectionRecord;
  primaryConnector: ConnectorRecord;
  options: VirtualCollectionReadOptions;
  joinTargets?: Array<{
    relation: VirtualRelation;
    collection: VirtualCollectionRecord;
    connector: ConnectorRecord;
  }>;
}): FederatedDecompositionPlan {
  const primaryPlanned = planVirtualQuery(args.options, args.primary, args.primaryConnector);
  const subExpressions: FederatedSubExpression[] = [
    snapshotSubExpression("primary", args.primary, args.primaryConnector, primaryPlanned),
  ];

  const connectorIds = [String(args.primaryConnector._id)];

  for (const target of args.joinTargets ?? []) {
    connectorIds.push(String(target.connector._id));
    const joinPlanned = planVirtualQuery(
      {
        tenantId: args.options.tenantId,
        limit: args.options.limit,
        bypassCache: true,
        user: args.options.user,
      },
      target.collection,
      target.connector,
    );
    subExpressions.push(
      snapshotSubExpression(
        `join:${target.relation.name}`,
        target.collection,
        target.connector,
        joinPlanned,
      ),
    );
  }

  const crossSource = detectCrossSourceConnectors(connectorIds);
  const mergeStrategy: MergeStrategy =
    subExpressions.length > 1 && !crossSource ? "hash-join" : "passthrough";

  return {
    version: "3.0-stable",
    crossSource,
    subExpressions,
    mergeStrategy,
    cursorModel: crossSource ? "per-source" : "none",
    blockedReason: crossSource
      ? "Cross-source decomposition detected — v3 merge execution not enabled"
      : undefined,
  };
}

export function assertDecompositionExecutable(
  plan: FederatedDecompositionPlan,
  options?: { crossSourceAlpha?: boolean },
): void {
  if (!plan.crossSource) return;
  if (options?.crossSourceAlpha) return;
  throw new FederationError(
    "FEDERATION_JOIN_NOT_SUPPORTED",
    plan.blockedReason ?? "Cross-source federation is not supported",
    400,
  );
}

export function annotateDecompositionForAlpha(
  plan: FederatedDecompositionPlan,
  crossSourceAlpha: boolean,
): FederatedDecompositionPlan {
  if (!plan.crossSource || !crossSourceAlpha) return plan;
  return {
    ...plan,
    mergeStrategy: "hash-join",
    blockedReason: undefined,
  };
}

/** Summarize AST for meta payloads without leaking full filter values */
export function summarizeAst(ast: FederatedQueryAST): {
  filterCount: number;
  hasSort: boolean;
  limit: number;
  offset: number;
  clamped: boolean;
} {
  return {
    filterCount: ast.filters.length,
    hasSort: ast.sort !== null,
    limit: ast.limit,
    offset: ast.offset,
    clamped: ast.clamped,
  };
}
