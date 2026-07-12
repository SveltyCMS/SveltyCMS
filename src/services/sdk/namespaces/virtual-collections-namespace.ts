/**
 * @file src/services/sdk/namespaces/virtual-collections-namespace.ts
 * @description LocalCMS namespace for virtual (federated) collections.
 *
 * Features:
 * - Zero HTTP overhead server-side reads
 * - Tenant + RBAC via virtual query engine
 * - modifyRequest pipeline parity with HTTP layer
 */

import type { DatabaseId, IDBAdapter } from "@databases/db-interface";
import {
  executeVirtualEnrichByKeys,
  type NativeVirtualStitchOptions,
} from "@plugins/unified-data-hub/server/native-virtual-stitch";
import {
  executeVirtualFindById,
  executeVirtualRead,
} from "@plugins/unified-data-hub/server/virtual-query-engine";
import {
  getConnectorById,
  getConnectorInstance,
  listVirtualCollections,
  sanitizeConnector,
} from "@plugins/unified-data-hub/server/connector-registry";
import { executeVirtualWrite } from "@plugins/unified-data-hub/server/virtual-write-engine";
import type {
  VirtualCollectionReadOptions,
  VirtualCollectionWriteOptions,
} from "@plugins/unified-data-hub/types";
import { pluginRegistry } from "@src/plugins/registry";

export class VirtualCollectionsNamespace {
  constructor(private readonly _dbAdapter: IDBAdapter) {}

  private async assertEnabled(tenantId?: string | null): Promise<void> {
    const plugin = pluginRegistry.get("unified-data-hub");
    if (!plugin) throw new Error("Unified Data Hub plugin is not installed");
    const tid = String(tenantId ?? "default");
    const state = await pluginRegistry.getPluginState("unified-data-hub", tid);
    if (!(state?.enabled ?? plugin.metadata.enabled)) {
      throw new Error("Unified Data Hub plugin is not enabled");
    }
  }

  async find(collectionId: string, options: VirtualCollectionReadOptions = {}) {
    await this.assertEnabled(options.tenantId);
    const result = await executeVirtualRead(this._dbAdapter, collectionId, options);
    return { success: true, data: result.data, meta: result.meta, total: result.total };
  }

  async enrichByKeys(
    collectionId: string,
    nativeKeys: (string | number)[],
    options: NativeVirtualStitchOptions = {},
  ) {
    await this.assertEnabled(options.tenantId);
    const result = await executeVirtualEnrichByKeys(
      this._dbAdapter,
      collectionId,
      nativeKeys,
      options,
    );
    return { success: true, data: result.data, meta: result.meta };
  }

  async findById(
    collectionId: string,
    entryId: string,
    options: VirtualCollectionReadOptions = {},
  ) {
    await this.assertEnabled(options.tenantId);
    const result = await executeVirtualFindById(this._dbAdapter, collectionId, entryId, options);
    return { success: true, data: result.data };
  }

  async listSchemas(options: VirtualCollectionReadOptions = {}) {
    await this.assertEnabled(options.tenantId);
    const tenantId = String(options.tenantId ?? "default") as unknown as DatabaseId;
    const schemas = await listVirtualCollections(this._dbAdapter, tenantId);
    return { success: true, data: schemas };
  }

  async create(
    collectionId: string,
    data: Record<string, unknown>,
    options: VirtualCollectionWriteOptions = {},
  ) {
    await this.assertEnabled(options.tenantId);
    const result = await executeVirtualWrite(
      this._dbAdapter,
      collectionId,
      "create",
      { ...options, data },
      undefined,
      [],
    );
    return { success: true, data: result.data, meta: result.meta };
  }

  async update(
    collectionId: string,
    entryId: string,
    data: Record<string, unknown>,
    options: VirtualCollectionWriteOptions = {},
  ) {
    await this.assertEnabled(options.tenantId);
    const result = await executeVirtualWrite(
      this._dbAdapter,
      collectionId,
      "update",
      { ...options, data },
      entryId,
      [],
    );
    return { success: true, data: result.data, meta: result.meta };
  }

  async delete(collectionId: string, entryId: string, options: VirtualCollectionWriteOptions = {}) {
    await this.assertEnabled(options.tenantId);
    const result = await executeVirtualWrite(
      this._dbAdapter,
      collectionId,
      "delete",
      options,
      entryId,
      [],
    );
    return { success: true, data: result.data, meta: result.meta };
  }

  async getConnectorHealth(connectorId: string, options: VirtualCollectionReadOptions = {}) {
    await this.assertEnabled(options.tenantId);
    const tenantId = String(options.tenantId ?? "default") as unknown as DatabaseId;
    const connector = await getConnectorById(this._dbAdapter, connectorId, tenantId);
    if (!connector) return { success: false, message: "Connector not found" };
    const instance = getConnectorInstance(connector.type);
    const health = await instance.healthCheck(connector);
    return {
      success: true,
      data: { ...sanitizeConnector(connector), health: health.health, message: health.message },
    };
  }
}
