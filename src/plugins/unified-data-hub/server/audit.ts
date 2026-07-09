/**
 * @file src/plugins/unified-data-hub/server/audit.ts
 * @description Cross-source federation audit logging.
 *
 * Features:
 * - Tenant-scoped audit entries
 * - Non-blocking write (errors logged, not thrown)
 */

import type { DatabaseId, IDBAdapter } from "@databases/db-interface";
import { logger } from "@utils/logger";
import { nowISODateString } from "@utils/date";

const AUDIT_COLLECTION = "plugin_unified-data-hub_federation_audit";

export async function logFederationAccess(
  db: IDBAdapter,
  entry: {
    tenantId: string;
    userId?: string;
    collectionId: string;
    connectorId: string;
    action:
      | "read"
      | "health_check"
      | "connector_save"
      | "write_create"
      | "write_update"
      | "write_delete";
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.crud.insert(
      AUDIT_COLLECTION,
      {
        ...entry,
        timestamp: nowISODateString(),
      } as any,
      { tenantId: entry.tenantId as DatabaseId, bypassTenantCheck: false },
    );
  } catch (err) {
    logger.debug("[unified-data-hub] Audit log write failed", { err });
  }
}
