/**
 * @file src/routes/api/graphql/resolvers/virtual-collections.ts
 * @description GraphQL read/write path for federated virtual collections.
 *
 * Features:
 * - virtualCollections / virtualCollection / virtualEnrich — reads
 * - createVirtualEntry / updateVirtualEntry / deleteVirtualEntry — writes (v2.3)
 * - Delegates to LocalCMS virtualCollections namespace
 */

import type { IDBAdapter } from "@databases/db-interface";
import { LocalCMS } from "@src/services/sdk";
import { pluginRegistry } from "@src/plugins/registry";
import { logger } from "@utils/logger";

export const virtualCollectionsTypeDefs = `
  type VirtualDecompositionMeta {
    version: String!
    crossSource: Boolean!
    subExpressionCount: Int!
    mergeStrategy: String!
    cursorModel: String!
  }

  type VirtualFederationMeta {
    connectorId: String!
    staleness: String!
    clamped: Boolean
    cachedAt: String
    included: [String!]
    nextCursor: String
    cursorOffset: Int
    decomposition: VirtualDecompositionMeta
    stitchWarning: Boolean
    nearBudget: Boolean
    warningCode: String
    joinKeyCount: Int
    joinBudget: Int
  }

  type VirtualFederationRow {
    _id: String!
    connectorId: String!
    sourceKey: String!
    payload: String!
  }

  type VirtualFederationResult {
    data: [VirtualFederationRow!]!
    total: Int
    meta: VirtualFederationMeta!
  }

  type VirtualCollectionInfo {
    id: String!
    slug: String!
    name: String!
    connectorId: String!
    type: String!
  }

  type VirtualEnrichMeta {
    connectorId: String!
    keyCount: Int!
    matched: Int!
    staleness: String!
    stitchWarning: Boolean
    nearBudget: Boolean
    warningCode: String
    budget: Int
    utilization: Float
    message: String
  }

  type VirtualEnrichEntry {
    key: String!
    payload: String
  }

  type VirtualEnrichResult {
    data: [VirtualEnrichEntry!]!
    meta: VirtualEnrichMeta!
  }

  type VirtualWriteMeta {
    connectorId: String!
    operation: String!
    sourceKey: String
  }

  type VirtualWriteResult {
    data: VirtualFederationRow
    meta: VirtualWriteMeta!
  }
`;

export const virtualCollectionsQueryFields = `
  virtualCollections: [VirtualCollectionInfo!]!
  virtualCollection(
    slug: String!
    limit: Int
    offset: Int
    cursor: String
    include: [String!]
    bypassCache: Boolean
  ): VirtualFederationResult
  virtualEnrich(slug: String!, keys: [String!]!, field: String): VirtualEnrichResult
`;

export const virtualCollectionsMutationFields = `
  createVirtualEntry(slug: String!, payload: String!): VirtualWriteResult!
  updateVirtualEntry(slug: String!, entryId: String!, payload: String!): VirtualWriteResult!
  deleteVirtualEntry(slug: String!, entryId: String!): VirtualWriteResult!
`;

function parseWritePayload(payload: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Invalid payload JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function mapFederationMeta(meta: Record<string, unknown> | undefined) {
  const decomposition = meta?.decomposition as Record<string, unknown> | undefined;
  return {
    connectorId: String(meta?.connectorId ?? ""),
    staleness: String(meta?.staleness ?? "real-time"),
    clamped: (meta?.clamped as boolean | undefined) ?? false,
    cachedAt: (meta?.cachedAt as string | undefined) ?? null,
    included: (meta?.included as string[] | undefined) ?? null,
    nextCursor: (meta?.nextCursor as string | undefined) ?? null,
    cursorOffset: (meta?.cursorOffset as number | undefined) ?? null,
    decomposition: decomposition
      ? {
          version: String(decomposition.version ?? ""),
          crossSource: Boolean(decomposition.crossSource),
          subExpressionCount: Number(decomposition.subExpressionCount ?? 0),
          mergeStrategy: String(decomposition.mergeStrategy ?? ""),
          cursorModel: String(decomposition.cursorModel ?? ""),
        }
      : null,
    stitchWarning: (meta?.stitchWarning as boolean | undefined) ?? null,
    nearBudget: (meta?.nearBudget as boolean | undefined) ?? null,
    warningCode: (meta?.warningCode as string | undefined) ?? null,
    joinKeyCount: (meta?.joinKeyCount as number | undefined) ?? null,
    joinBudget: (meta?.joinBudget as number | undefined) ?? null,
  };
}

async function isHubEnabled(tenantId: string): Promise<boolean> {
  const plugin = pluginRegistry.get("unified-data-hub");
  if (!plugin) return false;
  const state = await pluginRegistry.getPluginState("unified-data-hub", tenantId);
  return state?.enabled ?? plugin.metadata.enabled;
}

function mapRow(row: Record<string, unknown>) {
  const source = row._source as { connectorId?: string; sourceKey?: string } | undefined;
  const { _id, _source, ...rest } = row;
  return {
    _id: String(_id),
    connectorId: source?.connectorId ?? "",
    sourceKey: source?.sourceKey ?? "",
    payload: JSON.stringify(rest),
  };
}

function mapWriteResult(result: {
  data?: Record<string, unknown> | null;
  meta?: { connectorId?: string; operation?: string; sourceKey?: string };
}) {
  return {
    data: result.data ? mapRow(result.data) : null,
    meta: {
      connectorId: result.meta?.connectorId ?? "",
      operation: result.meta?.operation ?? "",
      sourceKey: result.meta?.sourceKey ?? null,
    },
  };
}

export function virtualCollectionsResolvers(dbAdapter: IDBAdapter, tenantId?: string | null) {
  return virtualCollectionsQueryResolvers(dbAdapter, tenantId);
}

export function virtualCollectionsQueryResolvers(dbAdapter: IDBAdapter, tenantId?: string | null) {
  const tid = tenantId ?? "default";

  return {
    virtualCollections: async (_: unknown, __: unknown, ctx: { user?: unknown }) => {
      if (!(await isHubEnabled(tid))) return [];
      try {
        const cms = new LocalCMS(dbAdapter);
        const result = await cms.virtualCollections.listSchemas({
          tenantId: tid,
          user: ctx.user as any,
        });
        const rows = result.data ?? [];
        return rows.map((vc: any) => ({
          id: String(vc._id),
          slug: vc.slug,
          name: vc.name,
          connectorId: vc.connectorId,
          type: "virtual",
        }));
      } catch (err) {
        logger.debug("[GraphQL] virtualCollections query skipped", { err });
        return [];
      }
    },

    virtualCollection: async (
      _: unknown,
      args: {
        slug: string;
        limit?: number;
        offset?: number;
        cursor?: string;
        include?: string[];
        bypassCache?: boolean;
      },
      ctx: { user?: unknown },
    ) => {
      if (!(await isHubEnabled(tid))) {
        throw new Error("Unified Data Hub plugin is not enabled");
      }
      const cms = new LocalCMS(dbAdapter);
      const result = await cms.virtualCollections.find(args.slug, {
        tenantId: tid,
        user: ctx.user as any,
        limit: args.limit ?? 25,
        offset: args.offset ?? 0,
        cursor: args.cursor,
        include: args.include,
        bypassCache: args.bypassCache,
      });
      return {
        data: (result.data ?? []).map((row: Record<string, unknown>) => mapRow(row)),
        total: result.total,
        meta: mapFederationMeta(result.meta as Record<string, unknown> | undefined),
      };
    },

    virtualEnrich: async (
      _: unknown,
      args: { slug: string; keys: string[]; field?: string },
      ctx: { user?: unknown },
    ) => {
      if (!(await isHubEnabled(tid))) {
        throw new Error("Unified Data Hub plugin is not enabled");
      }
      const cms = new LocalCMS(dbAdapter);
      const result = await cms.virtualCollections.enrichByKeys(args.slug, args.keys ?? [], {
        tenantId: tid,
        user: ctx.user as any,
        virtualKeyField: args.field ?? "id",
        bypassCache: true,
      });
      const entries = Object.entries(result.data ?? {}).map(([key, row]) => ({
        key,
        payload: row ? JSON.stringify(row) : null,
      }));
      return {
        data: entries,
        meta: {
          connectorId: result.meta?.connectorId ?? "",
          keyCount: result.meta?.keyCount ?? 0,
          matched: result.meta?.matched ?? 0,
          staleness: result.meta?.staleness ?? "real-time",
          stitchWarning: result.meta?.stitchWarning ?? false,
          nearBudget: result.meta?.nearBudget ?? false,
          warningCode: result.meta?.warningCode ?? "NONE",
          budget: result.meta?.budget ?? null,
          utilization: result.meta?.utilization ?? 0,
          message: result.meta?.message ?? null,
        },
      };
    },
  };
}

export function virtualCollectionsMutationResolvers(
  dbAdapter: IDBAdapter,
  tenantId?: string | null,
) {
  const tid = tenantId ?? "default";

  return {
    createVirtualEntry: async (
      _: unknown,
      args: { slug: string; payload: string },
      ctx: { user?: unknown },
    ) => {
      if (!(await isHubEnabled(tid))) {
        throw new Error("Unified Data Hub plugin is not enabled");
      }
      const cms = new LocalCMS(dbAdapter);
      const result = await cms.virtualCollections.create(
        args.slug,
        parseWritePayload(args.payload),
        { tenantId: tid, user: ctx.user as any },
      );
      return mapWriteResult(result);
    },

    updateVirtualEntry: async (
      _: unknown,
      args: { slug: string; entryId: string; payload: string },
      ctx: { user?: unknown },
    ) => {
      if (!(await isHubEnabled(tid))) {
        throw new Error("Unified Data Hub plugin is not enabled");
      }
      const cms = new LocalCMS(dbAdapter);
      const result = await cms.virtualCollections.update(
        args.slug,
        args.entryId,
        parseWritePayload(args.payload),
        { tenantId: tid, user: ctx.user as any },
      );
      return mapWriteResult(result);
    },

    deleteVirtualEntry: async (
      _: unknown,
      args: { slug: string; entryId: string },
      ctx: { user?: unknown },
    ) => {
      if (!(await isHubEnabled(tid))) {
        throw new Error("Unified Data Hub plugin is not enabled");
      }
      const cms = new LocalCMS(dbAdapter);
      const result = await cms.virtualCollections.delete(args.slug, args.entryId, {
        tenantId: tid,
        user: ctx.user as any,
      });
      return mapWriteResult(result);
    },
  };
}
