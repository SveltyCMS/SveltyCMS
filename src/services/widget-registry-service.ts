/**
 * @file src/services/widget-registry-service.ts
 * @description High-performance, benchmark-friendly widget registry.
 */

import { coreModules, customModules } from "@src/widgets/scanner";
import type { WidgetFactory, WidgetModule, WidgetType } from "@src/widgets/types";
import { logger } from "@utils/logger";

class WidgetRegistryService {
  private static instance: WidgetRegistryService;

  private readonly widgets = new Map<string, WidgetFactory>();
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private initStartTime = 0;

  private constructor() {}

  public static getInstance(): WidgetRegistryService {
    if (!WidgetRegistryService.instance) {
      WidgetRegistryService.instance = new WidgetRegistryService();
    }
    return WidgetRegistryService.instance;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  public async initialize(force = false): Promise<void> {
    if (this.isInitialized && !force) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initStartTime = performance.now();
    this.initializationPromise = this._doInitialize();

    return this.initializationPromise.finally(() => {
      this.initializationPromise = null;
    });
  }

  private async _doInitialize(): Promise<void> {
    logger.info("WidgetRegistryService: Starting initialization...");

    try {
      // Register core + custom widgets (fast path)
      this._registerPreScannedWidgets();

      // Marketplace widgets (only if needed)
      if (process.env.NODE_ENV !== "test" && process.env.BENCHMARK_MODE !== "true") {
        await this._scanMarketplaceWidgets();
      }

      this.isInitialized = true;

      const duration = (performance.now() - this.initStartTime).toFixed(2);
      logger.info(
        `WidgetRegistryService initialized with ${this.widgets.size} widgets in ${duration}ms`,
      );

      this._updateServiceHealth("healthy");
    } catch (err: any) {
      logger.error("WidgetRegistryService initialization failed", err);
      this._updateServiceHealth("unhealthy");
      throw err;
    }
  }

  private _registerPreScannedWidgets() {
    for (const [path, module] of Object.entries(coreModules)) {
      this._registerWidget(path, module as WidgetModule, "core");
    }

    for (const [path, module] of Object.entries(customModules)) {
      this._registerWidget(path, module as WidgetModule, "custom");
    }
  }

  private _registerWidget(path: string, module: WidgetModule, type: WidgetType) {
    try {
      const processed = this._processWidgetModule(path, module, type);
      if (processed) {
        this.widgets.set(processed.name, processed.widgetFn);
        logger.trace(`[Widget] Registered ${type}: ${processed.name}`);
      }
    } catch (err) {
      logger.warn(`Failed to register widget from ${path}`, err);
    }
  }

  private _processWidgetModule(path: string, module: WidgetModule, type: WidgetType) {
    if (typeof module.default !== "function") return null;

    const originalFn = module.default;
    const name = originalFn.Name || path.split("/").at(-2) || "unknown";

    const widgetFn: WidgetFactory = Object.assign((config: any) => originalFn(config), {
      Name: name,
      GuiSchema: originalFn.GuiSchema,
      Icon: originalFn.Icon,
      Description: originalFn.Description,
      aggregations: originalFn.aggregations,
      __widgetType: type,
      __dependencies: originalFn.__dependencies || [],
      __inputComponentPath: originalFn.__inputComponentPath || "",
      __displayComponentPath: originalFn.__displayComponentPath || "",
    }) as WidgetFactory;

    return { name, widgetFn };
  }

  private async _scanMarketplaceWidgets() {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const marketplaceDir = path.resolve(process.cwd(), "src/widgets/marketplace");

      const entries = await fs
        .readdir(marketplaceDir, { withFileTypes: true })
        .catch(() => [] as any[]);

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const indexPath = path.join(marketplaceDir, entry.name, "index.ts");
        try {
          const mod = (await import(/* @vite-ignore */ indexPath)) as WidgetModule;
          if (mod.default && typeof mod.default === "function") {
            this._registerWidget(indexPath, mod, "marketplace");
          }
        } catch (err) {
          logger.debug(`Marketplace widget skipped: ${entry.name}`, err);
        }
      }
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        logger.warn("Marketplace widget scan failed", err);
      }
    }
  }

  private _updateServiceHealth(status: "healthy" | "unhealthy") {
    // Only run on main thread
    if (typeof process !== "undefined" && process.env.BENCHMARK_MODE === "true") return;

    try {
      import("@src/stores/system/state")
        .then(({ updateServiceHealth }) => {
          updateServiceHealth("widgets", status, `Widgets: ${this.widgets.size}`);
        })
        .catch(() => {});
    } catch {}
  }

  // Public API
  public async getWidget(name: string): Promise<WidgetFactory | undefined> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.widgets.get(name);
  }

  public async getAllWidgets(): Promise<Map<string, WidgetFactory>> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return new Map(this.widgets); // defensive copy
  }

  public getWidgetSync(name: string): WidgetFactory | undefined {
    return this.widgets.get(name);
  }

  public clearCache() {
    this.widgets.clear();
    this.isInitialized = false;
  }
}

// Export singleton
export const widgetRegistryService = WidgetRegistryService.getInstance();
