/**
 * @file src/plugins/unified-data-hub/server/tier-limits.ts
 * @description Community tier limits for Unified Data Hub (license enforcement).
 *
 * Pro/Enterprise (hasLicense): unlimited connectors and virtual collections.
 * Community/trial: capped per plugin config.public defaults.
 *
 * Features:
 * - CMS-agnostic counting via dbAdapter.crud
 * - Skips limit check on updates (existing _id)
 */

import type { DatabaseId } from "@src/content/types";
import type { IDBAdapter } from "@databases/db-interface";
import { checkExtensionLicense } from "@src/utils/license-manager";
import { FederationError } from "../types";
import { unifiedDataHubPlugin } from "../index";

const CONNECTORS_COLLECTION = "plugin_unified-data-hub_connectors";
const SCHEMAS_COLLECTION = "plugin_unified-data-hub_virtual_schemas";

export interface TierLimitStatus {
  tier: "pro" | "community";
  maxConnectors: number | null;
  maxVirtualCollections: number | null;
  connectorCount: number;
  virtualCollectionCount: number;
}

export async function getTierLimitStatus(
  db: IDBAdapter,
  tenantId: DatabaseId,
): Promise<TierLimitStatus> {
  const license = await checkExtensionLicense("plugin", "unified-data-hub");
  const isPro = license.hasLicense;
  const publicCfg = unifiedDataHubPlugin.config?.public ?? {};
  const maxConnectors = isPro ? null : Number(publicCfg.maxConnectorsFree ?? 1);
  const maxVirtualCollections = isPro ? null : Number(publicCfg.maxVirtualCollectionsFree ?? 3);

  const [connectors, collections] = await Promise.all([
    db.crud.findMany(CONNECTORS_COLLECTION, { tenantId }, { tenantId, limit: 200 }),
    db.crud.findMany(SCHEMAS_COLLECTION, { tenantId }, { tenantId, limit: 500 }),
  ]);

  return {
    tier: isPro ? "pro" : "community",
    maxConnectors,
    maxVirtualCollections,
    connectorCount: connectors.success && connectors.data ? connectors.data.length : 0,
    virtualCollectionCount: collections.success && collections.data ? collections.data.length : 0,
  };
}

export async function assertCanAddConnector(
  db: IDBAdapter,
  tenantId: DatabaseId,
  existingId?: string,
): Promise<void> {
  if (existingId) {
    const found = await db.crud.findOne(
      CONNECTORS_COLLECTION,
      { _id: existingId as DatabaseId, tenantId },
      { tenantId },
    );
    if (found.success && found.data) return;
  }

  const status = await getTierLimitStatus(db, tenantId);
  if (status.maxConnectors === null) return;
  if (status.connectorCount >= status.maxConnectors) {
    throw new FederationError(
      "LICENSE_TIER_LIMIT",
      `Community tier allows ${status.maxConnectors} connector(s). Upgrade for unlimited connectors.`,
      403,
    );
  }
}

export async function assertCanAddVirtualCollection(
  db: IDBAdapter,
  tenantId: DatabaseId,
  existingId?: string,
): Promise<void> {
  if (existingId) {
    const found = await db.crud.findOne(
      SCHEMAS_COLLECTION,
      { _id: existingId as DatabaseId, tenantId },
      { tenantId },
    );
    if (found.success && found.data) return;
  }

  const status = await getTierLimitStatus(db, tenantId);
  if (status.maxVirtualCollections === null) return;
  if (status.virtualCollectionCount >= status.maxVirtualCollections) {
    throw new FederationError(
      "LICENSE_TIER_LIMIT",
      `Community tier allows ${status.maxVirtualCollections} virtual collection(s). Upgrade for unlimited collections.`,
      403,
    );
  }
}
