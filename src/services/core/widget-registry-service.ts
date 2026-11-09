/**
 * @file src/services/core/widget-registry-service.ts
 * @description High-performance, benchmark-friendly widget registry.
 */

import * as scanner from "../../widgets/scanner";
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
  /** Bumped when the widget source set changes (clearCache), invalidating the pre-scan latch. */
  private preScanVersion = 0;
  /** Version for which `loadWidgetFactories` + `_registerPreScannedWidgets` last completed. */
  private preScanAppliedVersion = -1;
  private preScanPromise: Promise<void> | null = null;

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
    for (const [path, module] of Object.entries(scanner.coreModules)) {
      this._registerWidget(path, module as WidgetModule, "core");
    }

    for (const [path, module] of Object.entries(scanner.customModules)) {
      this._registerWidget(path, module as WidgetModule, "custom");
    }

    // Vite-eager marketplace packages (if any were present at build time)
    for (const [path, module] of Object.entries(scanner.marketplaceModules)) {
      this._registerWidget(path, module as WidgetModule, "marketplace");
    }
  }

  /**
   * Lazily evaluate every factory chunk and register the pre-scanned modules
   * once per registry version. Without the latch `getAllWidgets()` re-ran the
   * whole scanner and rebuilt every factory wrapper (`Object.assign` + a trace
   * string) on each call.
   */
  private async _ensurePreScannedWidgets(): Promise<void> {
    if (this.preScanAppliedVersion === this.preScanVersion) return;
    if (!this.preScanPromise) {
      const version = this.preScanVersion;
      this.preScanPromise = (async () => {
        try {
          if (typeof scanner.loadWidgetFactories === "function") {
            await scanner.loadWidgetFactories();
          }
        } catch {
          // Scanner mock has no loader map; pre-registered factories still apply.
        }
        // A clearCache() during the load bumps the version — let the next pass
        // register against the new source set instead of recording this one.
        if (version === this.preScanVersion) {
          this._registerPreScannedWidgets();
          this.preScanAppliedVersion = version;
        }
      })().finally(() => {
        this.preScanPromise = null;
      });
    }
    await this.preScanPromise;
    if (this.preScanAppliedVersion !== this.preScanVersion) {
      await this._ensurePreScannedWidgets();
    }
  }

  private _registerWidget(path: string, module: WidgetModule, type: WidgetType) {
    try {
      const processed = this._processWidgetModule(path, module, type);
      if (processed) {
        // Register under factory Name only (single convention)
        this.widgets.set(processed.name, processed.widgetFn);
        if (logger.isLevel("trace")) {
          logger.trace(`[Widget] Registered ${type}: ${processed.name}`);
        }
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

      // One pass over the registry instead of re-scanning it for every folder
      // (the previous shape was O(folders × widgets)).
      const registeredFolders = new Set<string>();
      for (const widget of this.widgets.values()) {
        const folder = (widget as { __folder?: string }).__folder;
        if (folder) registeredFolders.add(folder);
      }

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
          if (registeredFolders.has(entry.name)) continue;

          const mod = (await import(/* @vite-ignore */ indexPath)) as WidgetModule;
          if (mod.default && typeof mod.default === "function") {
            this._registerWidget(indexPath, mod, "marketplace");
            registeredFolders.add(entry.name);
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
    } catch (error) {
      logger.debug("[widget-registry-service] suppressed error", error);
    }
  }

  // Public API
  /** A factory chunk exists and has not been evaluated yet. */
  public canLoad(name: string): boolean {
    if (this.widgets.has(name)) return false;
    try {
      // Namespace access on purpose: test setups replace this module with a
      // partial mock, and a named import of a missing loader is an ESM linking
      // error ("export named ... not found") rather than a caught call.
      return typeof scanner.hasWidgetLoader === "function" ? scanner.hasWidgetLoader(name) : false;
    } catch {
      return false;
    }
  }

  /**
   * Evaluate and register only the named factories. A second call for the
   * same name is a registry hit.
   */
  public async ensureWidgets(names: Iterable<string>): Promise<void> {
    const missing: string[] = [];
    for (const name of names) {
      if (name && !this.widgets.has(name)) missing.push(name);
    }
    if (missing.length === 0) return;
    try {
      if (typeof scanner.loadWidgetFactories === "function") {
        await scanner.loadWidgetFactories(missing);
      }
    } catch {
      // Test mocks replace the scanner and do not export the loader.
    }
    this._registerPreScannedWidgets();
  }

  public async getWidget(name: string): Promise<WidgetFactory | undefined> {
    if (!this.widgets.has(name)) {
      await this.ensureWidgets([name]);
    }
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.widgets.get(name);
  }

  public async getAllWidgets(): Promise<Map<string, WidgetFactory>> {
    await this._ensurePreScannedWidgets();
    if (!this.isInitialized) {
      await this.initialize();
    }
    // Live view: callers only read/iterate (admin catalog, builder tools) and
    // must never mutate. A defensive `new Map(...)` per call was pure waste.
    return this.widgets;
  }

  public getWidgetSync(name: string): WidgetFactory | undefined {
    return this.widgets.get(name);
  }

  public clearCache() {
    this.widgets.clear();
    this.isInitialized = false;
    // Force the next `getAllWidgets()` to re-evaluate + re-register the sources.
    this.preScanVersion++;
    this.preScanAppliedVersion = -1;
  }
}

// Export singleton
export const widgetRegistryService = WidgetRegistryService.getInstance();
