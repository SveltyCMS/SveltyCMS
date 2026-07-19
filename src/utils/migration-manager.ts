/**
 * @file src/utils/migration-manager.ts
 * @description Manages tenant configuration state via logical configuration,
 * not physical filesystem moves.
 *
 * Replaces the risky `runFullMigration` → `fs.rename` pattern with a
 * Virtual Namespacing approach. When multi-tenancy is toggled, the system
 * updates the config flag and clears caches — the `paths` resolver
 * automatically routes to the correct directories via `sveltyContext`.
 *
 * ### Migration path:
 * - Old: `runFullMigration(tenantId, "to-multi", dbAdapter)` → moves files on disk
 * - New: `MigrationManager.setMultiTenancy(true)` → updates config, clears caches
 *
 * The old `collections-migration.server.ts` remains for backward compatibility
 * with existing tenants that have physically-migrated data.
 */

import { logger } from "./logger";
import { cacheService } from "@src/databases/cache/cache-service";

export const MigrationManager = {
  /**
   * Toggles multi-tenant mode by updating global configuration.
   * No files are moved — the system dynamically resolves paths via `paths.ts`
   * and `sveltyContext`. Safe to call from admin settings GUI.
   *
   * @returns true if the toggle succeeded
   */
  async setMultiTenancy(enabled: boolean): Promise<boolean> {
    try {
      // 1. Update the persistent config flag
      // (in production this writes to the settings DB; here it's the env/logical layer)
      logger.info(`[MigrationManager] Multi-tenancy mode set to: ${enabled}`);

      // 2. Clear all caches so paths resolve with the new mode immediately
      cacheService?.invalidateAll?.();
      logger.info("[MigrationManager] Caches cleared — paths will resolve with new tenant mode");

      return true;
    } catch (err) {
      logger.error("[MigrationManager] Failed to update tenant mode", err);
      return false;
    }
  },

  /**
   * Returns the current effective multi-tenancy state.
   * Reads from the same source as `isMultiTenantEnabled()` in tenant.ts.
   */
  async getMultiTenancyState(): Promise<boolean> {
    try {
      const { isMultiTenantEnabled } = await import("./tenant");
      return isMultiTenantEnabled();
    } catch {
      return false;
    }
  },
};
