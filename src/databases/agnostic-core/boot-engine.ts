/**
 * @file src/databases/agnostic-core/boot-engine.ts
 * @description
 * Declarative dependency-graph boot engine for SveltyCMS.
 * Resolves boot order automatically and parallelizes independent services.
 */

import { logger } from "@utils/logger";
import { updateServiceHealth } from "@src/stores/system/state";

export type ServiceId =
  | "adapter"
  | "auth"
  | "content"
  | "media"
  | "monitoring"
  | "system"
  | "cache"
  | "themes"
  | "settings"
  | "widgets"
  | "optimizer";

export interface BootService {
  id: ServiceId;
  dependencies: ServiceId[];
  init: () => Promise<void>;
  critical?: boolean;
}

export class BootEngine {
  private services = new Map<ServiceId, BootService>();
  private results = new Map<ServiceId, Promise<void>>();

  public register(service: BootService): void {
    this.services.set(service.id, service);
  }

  public async boot(): Promise<void> {
    const start = performance.now();
    logger.info("🚀 SveltyCMS V8 Boot Engine starting...");

    // 1. Check for circular dependencies (basic check)
    this.validateGraph();

    // 2. Resolve and execute
    const criticalIds = Array.from(this.services.values())
      .filter((s) => s.critical)
      .map((s) => s.id);
    const nonCriticalIds = Array.from(this.services.values())
      .filter((s) => !s.critical)
      .map((s) => s.id);

    const criticalPromises = criticalIds.map((id) => this.initService(id));
    const nonCriticalPromises = nonCriticalIds.map((id) => this.initService(id));

    try {
      // 🚀 PHASED BOOT: Only wait for critical services (DB, Auth, Settings)
      await Promise.all(criticalPromises);
      const duration = (performance.now() - start).toFixed(2);
      logger.info(`⚡ Critical boot phase complete in ${duration}ms. System is READY.`);

      // Allow non-critical services to finish in background (WARMING -> WARMED)
      Promise.all(nonCriticalPromises).catch((err) => {
        logger.error("Background boot tasks failed:", err);
      });
    } catch (err) {
      logger.error("💥 Critical boot failure:", err);
      throw err;
    }
  }

  private async initService(id: ServiceId): Promise<void> {
    // Return existing promise if already initializing
    if (this.results.has(id)) {
      return this.results.get(id)!;
    }

    const service = this.services.get(id);
    if (!service) {
      throw new Error(`Unknown service: ${id}`);
    }

    const bootPromise = (async () => {
      // 1. Wait for all dependencies in parallel
      if (service.dependencies.length > 0) {
        logger.debug(`[Boot] Service "${id}" waiting for: ${service.dependencies.join(", ")}`);
        await Promise.all(service.dependencies.map((depId) => this.initService(depDep(depId))));
      }

      // 2. Initialize this service
      try {
        updateServiceHealth(this.mapToStoreId(id), "initializing", `Booting ${id}...`);
        const s0 = performance.now();
        await service.init();
        const d0 = (performance.now() - s0).toFixed(2);

        updateServiceHealth(this.mapToStoreId(id), "healthy", `${id} ready`);
        logger.info(`[Boot] Service "${id}" ready (${d0}ms).`);
      } catch (err) {
        updateServiceHealth(
          this.mapToStoreId(id),
          "unhealthy",
          `${id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (service.critical) {
          throw err;
        }
        logger.warn(`[Boot] Non-critical service "${id}" failed:`, err);
      }
    })();

    // Helper for recursion mapping
    function depDep(depId: ServiceId): ServiceId {
      return depId;
    }

    this.results.set(id, bootPromise);
    return bootPromise;
  }

  private validateGraph(): void {
    // Simple cycle detection could be added here
    // For now, we trust the declarative definitions in db-init.ts
  }

  private mapToStoreId(id: ServiceId): any {
    const mapping: Record<ServiceId, string> = {
      adapter: "database",
      auth: "auth",
      content: "contentSystem",
      media: "database", // media is not a standalone state service
      monitoring: "database", // monitoring is not a standalone state service
      system: "database",
      cache: "cache",
      themes: "themeManager",
      settings: "database",
      widgets: "widgets", // "widgets" is a valid service name
      optimizer: "database",
    };
    return mapping[id] || "database";
  }
}
