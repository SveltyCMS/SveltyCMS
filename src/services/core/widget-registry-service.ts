/**
 * @file src/services/widget-registry-service.ts
 * @description High-performance, benchmark-friendly widget registry.
 */

import { coreModules, customModules, marketplaceModules } from "../../widgets/scanner";
import type { WidgetFactory, WidgetModule, WidgetType } from "@src/widgets/types";
import {
  folderFromWidgetPath,
  isValidWidgetFolder,
  validateWidgetNaming,
  type WidgetTier,
} from "@src/widgets/widget-naming";
import { logger } from "@utils/logger";

class WidgetRegistryService {
  private static instance: WidgetRegistryService;

  private readonly widgets = new Map<string, WidgetFactory>();
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private initStartTime = 0;

  private constructor() {
    this._registerPreScannedWidgets();
    this.isInitialized = true;
  }

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
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

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
      if (process.env.NODE_ENV !== "test" && process.env.BENCHMARK !== "true") {
        await this._scanMarketplaceWidgets();
      }

      this.isInitialized = true;

      const duration = (performance.now() - this.initStartTime).toFixed(2);
      logger.info(
        `WidgetRegistryService initialized with ${this.widgets.size} widgets in ${duration}ms`,
      );

      this._updateServiceHealth("healthy");
    } catch (err: unknown) {
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

    // Vite-eager marketplace packages (if any were present at build time)
    for (const [path, module] of Object.entries(marketplaceModules)) {
      this._registerWidget(path, module as WidgetModule, "marketplace");
    }
  }

  private _registerWidget(path: string, module: WidgetModule, type: WidgetType) {
    try {
      const processed = this._processWidgetModule(path, module, type);
      if (processed) {
        // Register under factory Name only (single convention)
        this.widgets.set(processed.name, processed.widgetFn);
        logger.trace(`[Widget] Registered ${type}: ${processed.name}`);
      }
    } catch (err) {
      logger.warn(`Failed to register widget from ${path}`, err);
    }
  }

  private _processWidgetModule(path: string, module: WidgetModule, type: WidgetType) {
    // 🚀 Robustness: Support both ESM (.default) and CJS/Function style modules
    const originalFn =
      module.default && typeof module.default === "function"
        ? module.default
        : typeof module === "function"
          ? (module as any)
          : null;

    if (!originalFn) return null;

    const folder = folderFromWidgetPath(path) || path.split(/[/\\]/).at(-2) || "";
    const naming = validateWidgetNaming(folder, originalFn.Name, type as WidgetTier);

    for (const w of naming.warnings) {
      logger.warn(`[Widget Naming] ${type} "${folder}": ${w}`);
    }
    if (!naming.ok) {
      logger.error(
        `[Widget Naming] Refusing to register ${type} widget at ${path}: ${naming.errors.join("; ")}`,
      );
      // Fail closed for custom + marketplace; still refuse invalid core to avoid broken loaders
      return null;
    }

    const name = naming.name;
    originalFn.Name = name;

    const widgetFn: WidgetFactory = Object.assign((config: any) => originalFn(config), {
      Name: name,
      GuiSchema: originalFn.GuiSchema,
      Icon: originalFn.Icon,
      Description: originalFn.Description,
      aggregations: originalFn.aggregations,
      modifyRequest: originalFn.modifyRequest,
      modifyRequestBatch: originalFn.modifyRequestBatch,
      validationSchema: originalFn.validationSchema,
      __widgetType: type,
      __dependencies: originalFn.__dependencies || [],
      __inputComponentPath: originalFn.__inputComponentPath || "",
      __displayComponentPath: originalFn.__displayComponentPath || "",
      __folder: naming.folder,
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

        // Folder must be kebab-case before we even import
        if (!isValidWidgetFolder(entry.name)) {
          logger.error(
            `[Widget Naming] Marketplace folder "${entry.name}" is not kebab-case — skipped. Use e.g. phone-number, not PhoneNumber.`,
          );
          continue;
        }

        const indexPath = path.join(marketplaceDir, entry.name, "index.ts");
        try {
          // Skip if already registered via Vite glob (same package)
          const already = [...this.widgets.values()].some(
            (w) => (w as { __folder?: string }).__folder === entry.name,
          );
          if (already) continue;

          const mod = (await import(/* @vite-ignore */ indexPath)) as WidgetModule;
          if (mod.default && typeof mod.default === "function") {
            this._registerWidget(indexPath, mod, "marketplace");
          }
        } catch (err) {
          logger.debug(`Marketplace widget skipped: ${entry.name}`, err);
        }
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn("Marketplace widget scan failed", err);
      }
    }
  }

  private _updateServiceHealth(status: "healthy" | "unhealthy") {
    // Only run on main thread
    if (typeof process !== "undefined" && process.env.BENCHMARK === "true") return;

    try {
      import("@src/stores/system/state.svelte.ts")
        .then(({ updateServiceHealth }) => {
          updateServiceHealth("widgets", status, `Widgets: ${this.widgets.size}`);
        })
        .catch(() => {
          logger.debug("Service health update for widgets failed silently");
        });
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
