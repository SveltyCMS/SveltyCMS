/**
 * @file src/plugins/unified-data-hub/server/mcp-extension.ts
 * @description WebMCP topology extension for virtual collections.
 *
 * Features:
 * - Extends discoverTopology() with virtual collection metadata
 * - Extends getContentGraph() with virtual→virtual and native→virtual edges
 * - Governed read + enrich helpers for AI agents
 * - No credential exposure
 */

import type { DatabaseId, IDBAdapter } from "@databases/db-interface";
import type { Schema } from "@src/content/types";
import { pluginRegistry } from "@src/plugins/registry";
import { listConnectors, listVirtualCollections, sanitizeConnector } from "./connector-registry";
import { executeVirtualEnrichByKeys } from "./native-virtual-stitch";
import { executeVirtualRead } from "./virtual-query-engine";

export interface FederationContentGraphNode {
  entries: number;
  relations: string[];
  type?: "native" | "virtual";
  connectorId?: string;
  enrichmentTargets?: string[];
}

const VIRTUAL_NODE_PREFIX = "virtual:";

export async function isHubEnabled(_db: IDBAdapter, tenantId: DatabaseId): Promise<boolean> {
  const plugin = pluginRegistry.get("unified-data-hub");
  if (!plugin) return false;
  const state = await pluginRegistry.getPluginState("unified-data-hub", tenantId);
  return state?.enabled ?? plugin.metadata.enabled;
}

export async function extendTopology(
  db: IDBAdapter,
  tenantId: DatabaseId = "default" as DatabaseId,
) {
  if (!(await isHubEnabled(db, tenantId))) {
    return { collections: [] as any[], adminRoutes: [] as string[], apiRoutes: [] as string[] };
  }

  const [virtualCollections, connectors] = await Promise.all([
    listVirtualCollections(db, tenantId),
    listConnectors(db, tenantId),
  ]);

  const connectorHealth = new Map(connectors.map((c) => [String(c._id), c.health]));

  const collections = virtualCollections.map((vc) => ({
    id: vc._id,
    name: vc.name,
    slug: vc.slug,
    type: "virtual" as const,
    connectorId: vc.connectorId,
    connectorHealth: connectorHealth.get(vc.connectorId) ?? "unknown",
    apiPath: `/api/virtual-collections/${vc.slug || vc._id}`,
    adminPath: `/collections/${vc.slug || vc._id}`,
    fieldCount: vc.fields?.length ?? 0,
    status: "published",
    staleness: "cache",
  }));

  return {
    collections,
    adminRoutes: collections.map((c) => c.adminPath),
    apiRoutes: collections.map((c) => c.apiPath),
  };
}

export async function listVirtualCollectionsForAgent(
  db: IDBAdapter,
  tenantId: DatabaseId,
  _user?: { _id?: string; role?: string; isAdmin?: boolean },
) {
  if (!(await isHubEnabled(db, tenantId))) {
    return { collections: [], connectors: [] };
  }

  const [virtualCollections, connectors] = await Promise.all([
    listVirtualCollections(db, tenantId),
    listConnectors(db, tenantId),
  ]);

  return {
    collections: virtualCollections.map((vc) => ({
      id: vc._id,
      slug: vc.slug,
      name: vc.name,
      connectorId: vc.connectorId,
      fields: vc.fields,
      relations: vc.relations ?? [],
      type: "virtual",
    })),
    connectors: connectors.map(sanitizeConnector),
  };
}

export function virtualGraphKey(slug: string): string {
  return `${VIRTUAL_NODE_PREFIX}${slug}`;
}

/** Augment native content graph with virtual nodes and enrichment edges */
export async function extendContentGraph(
  db: IDBAdapter,
  tenantId: DatabaseId,
  baseGraph: Record<string, FederationContentGraphNode>,
): Promise<Record<string, FederationContentGraphNode>> {
  if (!(await isHubEnabled(db, tenantId))) return baseGraph;

  const graph = { ...baseGraph };
  const virtualCollections = await listVirtualCollections(db, tenantId);

  for (const vc of virtualCollections) {
    const key = virtualGraphKey(vc.slug);
    graph[key] = {
      entries: -1,
      relations: (vc.relations ?? []).map((r) => virtualGraphKey(r.targetSlug)),
      type: "virtual",
      connectorId: String(vc.connectorId),
    };
  }

  const listResult = await db.collection.listSchemas();
  const schemas = (
    listResult && typeof listResult === "object" && "success" in listResult && listResult.success
      ? ((listResult as { data?: Schema[] }).data ?? [])
      : Array.isArray(listResult)
        ? listResult
        : []
  ) as Schema[];
  for (const schema of schemas) {
    const enrichments = schema.federationEnrichments ?? [];
    if (enrichments.length === 0) continue;

    const slug = schema.slug ?? String(schema._id);
    const nodeKey = slug in graph ? slug : String(schema._id);
    const existing = graph[nodeKey] ?? { entries: 0, relations: [], type: "native" as const };
    const enrichmentTargets = enrichments.map((e) => virtualGraphKey(e.virtualSlug));

    graph[nodeKey] = {
      ...existing,
      type: "native",
      enrichmentTargets,
      relations: [...new Set([...existing.relations, ...enrichmentTargets])],
    };
  }

  return graph;
}

export async function queryVirtualCollectionForAgent(
  db: IDBAdapter,
  collectionId: string,
  tenantId: DatabaseId,
  options: {
    limit?: number;
    offset?: number;
    cursor?: string;
    include?: string[];
    bypassCache?: boolean;
    user?: { _id?: string; role?: string; isAdmin?: boolean };
  },
  roles: unknown[] = [],
) {
  const result = await executeVirtualRead(
    db,
    collectionId,
    {
      tenantId,
      user: options.user,
      limit: Math.min(options.limit ?? 25, 100),
      offset: options.offset ?? 0,
      cursor: options.cursor,
      include: options.include,
      bypassCache: options.bypassCache,
    },
    roles,
  );
  return result;
}

export async function enrichVirtualCollectionForAgent(
  db: IDBAdapter,
  collectionId: string,
  keys: (string | number)[],
  tenantId: string,
  options: {
    virtualKeyField?: string;
    bypassCache?: boolean;
    user?: { _id?: string; role?: string; isAdmin?: boolean };
  } = {},
  roles: unknown[] = [],
) {
  return executeVirtualEnrichByKeys(
    db,
    collectionId,
    keys,
    {
      tenantId: tenantId as DatabaseId,
      user: options.user,
      virtualKeyField: options.virtualKeyField ?? "id",
      bypassCache: options.bypassCache ?? true,
    },
    roles,
  );
}

/** Register on globalThis for WebMCP gateway integration */
export function registerMcpExtension(db: IDBAdapter): void {
  (globalThis as any).__unified_data_hub_mcp = {
    extendTopology: (tenantId?: string) => extendTopology(db, tenantId as unknown as DatabaseId),
    extendContentGraph: (tenantId: string, baseGraph: Record<string, FederationContentGraphNode>) =>
      extendContentGraph(db, tenantId as unknown as DatabaseId, baseGraph),
    listVirtualCollections: (tenantId: string, user?: any) =>
      listVirtualCollectionsForAgent(db, tenantId as unknown as DatabaseId, user),
    queryVirtualCollection: (
      collectionId: string,
      tenantId: string,
      options: any,
      roles?: unknown[],
    ) =>
      queryVirtualCollectionForAgent(
        db,
        collectionId,
        tenantId as unknown as DatabaseId,
        options,
        roles,
      ),
    enrichVirtualCollection: (
      collectionId: string,
      keys: (string | number)[],
      tenantId: string,
      options?: any,
      roles?: unknown[],
    ) =>
      enrichVirtualCollectionForAgent(
        db,
        collectionId,
        keys,
        tenantId as unknown as DatabaseId,
        options,
        roles,
      ),
  };
}
