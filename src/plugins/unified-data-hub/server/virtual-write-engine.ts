/**
 * @file src/plugins/unified-data-hub/server/virtual-write-engine.ts
 * @description Single-source virtual collection write executor (create/update/delete).
 *
 * Features:
 * - License + RBAC gates
 * - Connector capability checks (writable flag)
 * - Tenant cache invalidation after mutations
 * - Federation audit logging
 */

import type { DatabaseId, IDBAdapter } from "@databases/db-interface";
import { checkExtensionLicense } from "@src/utils/license-manager";
import type {
  VirtualCollectionWriteOptions,
  VirtualWriteOperation,
  VirtualWriteResult,
} from "../types";
import { FederationError } from "../types";
import { getConnectorById, getConnectorInstance, getVirtualCollection } from "./connector-registry";
import { clearTenantCache } from "./cache";
import { assertVirtualWritePermission } from "./permission-engine";
import { logFederationAccess } from "./audit";

export async function executeVirtualWrite(
  db: IDBAdapter,
  collectionId: string,
  operation: VirtualWriteOperation,
  options: VirtualCollectionWriteOptions = {},
  entryId?: string,
  roles: unknown[] = [],
): Promise<VirtualWriteResult> {
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

  await assertVirtualWritePermission(options.user, roles, collection);

  const connector = await getConnectorById(db, collection.connectorId, tenantId);
  if (!connector || !connector.enabled) {
    throw new FederationError(
      "CONNECTOR_NOT_FOUND",
      `Connector not found: ${collection.connectorId}`,
      404,
    );
  }

  if (!connector.capabilities.writable) {
    throw new FederationError(
      "CONNECTOR_WRITE_NOT_SUPPORTED",
      `Connector ${connector.type} does not support writes`,
      405,
    );
  }

  const instance = getConnectorInstance(connector.type);
  const row = await instance.executeWrite({
    connector,
    collection,
    operation,
    entryId,
    data: options.data,
  });

  clearTenantCache(tenantId);

  await logFederationAccess(db, {
    tenantId,
    userId: options.user?._id,
    collectionId: collection.slug,
    connectorId: String(connector._id),
    action:
      operation === "create"
        ? "write_create"
        : operation === "update"
          ? "write_update"
          : "write_delete",
    meta: { entryId, operation },
  });

  return {
    data: row,
    meta: {
      connectorId: String(connector._id),
      operation,
      sourceKey: row?._source.sourceKey,
    },
  };
}
