/**
 * @file src/plugins/unified-data-hub/hub-page.server.ts
 * @description Server actions for Unified Data Hub plugin workspace.
 *
 * Features:
 * - Connector CRUD (credentials server-only)
 * - Virtual collection management
 * - Health checks
 * - Sanitized responses for client UI
 */

import { getDb } from "@src/databases/db";
import type { DatabaseId, ISODateString } from "@databases/db-interface";
import { nowISODateString } from "@utils/date";
import { checkExtensionLicense } from "@src/utils/license-manager";
import { generateUUID } from "@utils/native-utils";
import type { ConnectorRecord, VirtualCollectionRecord } from "./types";
import {
  buildWordPressVirtualCollection,
  type WordPressRestResource,
} from "./server/shared-schema/wordpress-rest";
import {
  getConnectorById,
  getConnectorInstance,
  listConnectors,
  listVirtualCollections,
  sanitizeConnector,
  saveConnector,
  saveVirtualCollection,
} from "./server/connector-registry";
import { assertConnectorAdmin } from "./server/permission-engine";
import { clearTenantCache } from "./server/cache";
import { logFederationAccess } from "./server/audit";
import { invalidateConnectorPool } from "./server/connector-pool-invalidation";
import {
  assertCanAddConnector,
  assertCanAddVirtualCollection,
  getTierLimitStatus,
} from "./server/tier-limits";
import { FederationError } from "./types";

function dbOrThrow() {
  const db = getDb();
  if (!db) throw new Error("Database not initialized");
  return db;
}

async function assertLicense() {
  const status = await checkExtensionLicense("plugin", "unified-data-hub");
  if (!status.active && !status.hasLicense) {
    return { type: "failure" as const, status: 403, data: { error: "License or trial required" } };
  }
  return null;
}

export const actions: Record<string, (event: any) => Promise<Record<string, unknown>>> = {
  listConnectors: async ({ locals }) => {
    const fail = await assertLicense();
    if (fail) return fail;
    assertConnectorAdmin(locals.user, locals.roles ?? []);
    const db = dbOrThrow();
    const rawTenantId = locals.tenantId ?? "default";
    const tenantId = String(rawTenantId) as unknown as DatabaseId;
    const connectors = await listConnectors(db, tenantId);
    return { connectors: connectors.map(sanitizeConnector) };
  },

  getTierLimits: async ({ locals }) => {
    const fail = await assertLicense();
    if (fail) return fail;
    const db = dbOrThrow();
    const rawTenantId = locals.tenantId ?? "default";
    const tenantId = String(rawTenantId) as unknown as DatabaseId;
    return { limits: await getTierLimitStatus(db, tenantId) };
  },

  saveConnector: async ({ locals, parsedBody }) => {
    const fail = await assertLicense();
    if (fail) return fail;
    assertConnectorAdmin(locals.user, locals.roles ?? []);
    const db = dbOrThrow();
    const rawTenantId = locals.tenantId ?? "default";
    const tenantId = String(rawTenantId) as unknown as DatabaseId;
    const body = parsedBody ?? {};
    try {
      await assertCanAddConnector(db, tenantId, body._id);
    } catch (err) {
      if (err instanceof FederationError) {
        return {
          type: "failure",
          status: err.status,
          data: { error: err.message, code: err.code },
        };
      }
      throw err;
    }
    const instance = getConnectorInstance(body.type);
    const config = { ...body.config } as Record<string, unknown>;
    if (body.type === "rest" && body.writesEnabled !== undefined) {
      config.writesEnabled = body.writesEnabled;
    }
    const defaultCaps = instance.getDefaultCapabilities();
    const capabilities = {
      ...(body.capabilities ?? defaultCaps),
      ...(body.type === "rest"
        ? { writable: Boolean(config.writesEnabled ?? defaultCaps.writable) }
        : {}),
    };
    const record: ConnectorRecord = {
      _id: (body._id || generateUUID()) as DatabaseId,
      tenantId,
      name: body.name,
      type: body.type,
      enabled: body.enabled ?? true,
      config,
      credentials: body.credentials,
      allowedHosts: body.allowedHosts ?? [],
      capabilities,
      health: "unknown",
      createdAt: nowISODateString() as ISODateString,
      updatedAt: nowISODateString() as ISODateString,
    };
    const saved = await saveConnector(db, record);
    await invalidateConnectorPool(record);
    clearTenantCache(tenantId);
    await logFederationAccess(db, {
      tenantId,
      userId: locals.user?._id,
      collectionId: "-",
      connectorId: saved._id,
      action: "connector_save",
    });
    return { connector: sanitizeConnector(saved) };
  },

  testConnector: async ({ locals, parsedBody }) => {
    const fail = await assertLicense();
    if (fail) return fail;
    assertConnectorAdmin(locals.user, locals.roles ?? []);
    const db = dbOrThrow();
    const rawTenantId = locals.tenantId ?? "default";
    const tenantId = String(rawTenantId) as unknown as DatabaseId;
    const connector = await getConnectorById(db, parsedBody?.connectorId, tenantId);
    if (!connector) return { type: "failure", status: 404, data: { error: "Connector not found" } };
    const instance = getConnectorInstance(connector.type);
    const result = await instance.healthCheck(connector);
    await db.crud.update(
      "plugin_unified-data-hub_connectors",
      connector._id as DatabaseId,
      {
        health: result.health,
        lastHealthCheck: new Date().toISOString(),
        lastError: result.message,
      } as any,
      { tenantId },
    );
    return { health: result.health, message: result.message };
  },

  listVirtualCollections: async ({ locals }) => {
    const fail = await assertLicense();
    if (fail) return fail;
    const db = dbOrThrow();
    const rawTenantId = locals.tenantId ?? "default";
    const tenantId = String(rawTenantId) as unknown as DatabaseId;
    const collections = await listVirtualCollections(db, tenantId);
    return { collections };
  },

  saveVirtualCollection: async ({ locals, parsedBody }) => {
    const fail = await assertLicense();
    if (fail) return fail;
    assertConnectorAdmin(locals.user, locals.roles ?? []);
    const db = dbOrThrow();
    const rawTenantId = locals.tenantId ?? "default";
    const tenantId = String(rawTenantId) as unknown as DatabaseId;
    const body = parsedBody ?? {};
    try {
      await assertCanAddVirtualCollection(db, tenantId, body._id);
    } catch (err) {
      if (err instanceof FederationError) {
        return {
          type: "failure",
          status: err.status,
          data: { error: err.message, code: err.code },
        };
      }
      throw err;
    }
    let record: VirtualCollectionRecord;

    if (body.wordpressResource) {
      const wp = buildWordPressVirtualCollection(
        body.wordpressResource as WordPressRestResource,
        body.connectorId,
        tenantId,
      );
      record = {
        _id: (body._id || generateUUID()) as DatabaseId,
        tenantId,
        name: wp.name,
        slug: wp.slug,
        connectorId: wp.connectorId,
        source: wp.source,
        fields: wp.fields,
        permissions: body.permissions ?? { read: ["collection:read"] },
        enabled: body.enabled ?? true,
        createdAt: "" as unknown as ISODateString,
        updatedAt: "" as unknown as ISODateString,
      };
    } else {
      record = {
        _id: (body._id || generateUUID()) as DatabaseId,
        tenantId,
        name: body.name,
        slug: body.slug,
        connectorId: body.connectorId,
        source: body.source ?? {},
        fields: body.fields ?? [],
        permissions: body.permissions ?? { read: ["collection:read"] },
        enabled: body.enabled ?? true,
        createdAt: "" as unknown as ISODateString,
        updatedAt: "" as unknown as ISODateString,
      };
    }
    const saved = await saveVirtualCollection(db, record);
    clearTenantCache(tenantId);
    return { collection: saved };
  },

  getCacheStats: async () => {
    const { getCacheStats } = await import("./server/cache");
    return getCacheStats();
  },

  getHeadlessContracts: async () => {
    const { unifiedDataHubHeadlessContracts } = await import("./headless-contracts");
    return { contracts: unifiedDataHubHeadlessContracts };
  },

  getHealthSummary: async ({ locals }) => {
    const fail = await assertLicense();
    if (fail) return fail;
    const db = dbOrThrow();
    const rawTenantId = locals.tenantId ?? "default";
    const tenantId = String(rawTenantId) as unknown as DatabaseId;
    const connectors = await listConnectors(db, tenantId);
    const collections = await listVirtualCollections(db, tenantId);
    return {
      connectorCount: connectors.length,
      virtualCollectionCount: collections.length,
      connectors: connectors.map((c) => ({
        id: c._id,
        name: c.name,
        health: c.health,
        type: c.type,
      })),
    };
  },
};
