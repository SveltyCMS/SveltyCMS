/**
 * @file src/stores/widget-store.svelte.ts
 * @description Centralized widget state management using Svelte 5 runes.
 *
 * This store handles:
 * - Scanning and loading both core and custom widgets.
 * - Initializing widgets with tenant-specific and database-driven status.
 * - Providing a unified registry for widget functions.
 * - Tracking active widgets and their dependencies.
 */

import type { FieldInstance } from "@src/content/types";
import type { DatabaseAdapter } from "@src/databases/db-interface";
// Removed static imports to prevent circular dependency with widgets
// import { coreModules, customModules } from "@src/widgets/scanner";
import { type WidgetDefinition, type WidgetFactory, type WidgetRecord } from "@src/widgets/types";
import type { Schema, FieldDefinition } from "@src/content/types";
import type { WidgetPlaceholder } from "@widgets/placeholder";
export type { WidgetDefinition, WidgetFactory };
import { logger } from "@utils/logger";

export type WidgetStatus = "active" | "inactive";

/**
 * Registry for all available widget functions
 */
export type WidgetRegistry = WidgetRecord;

export interface CollectionWidgetDependency {
  collectionId: string;
  collectionName: string;
  missingWidgets: string[];
  optionalWidgets: string[];
  requiredWidgets: string[];
}

class WidgetState {
  widgets = $state<Record<string, FieldInstance>>({});
  widgetFunctions = $state<WidgetRegistry>({});
  coreWidgets = $state<string[]>([]);
  customWidgets = $state<string[]>([]);
  marketplaceWidgets = $state<string[]>([]);
  activeWidgets = $state<string[]>([]);
  dependencyMap = $state<Record<string, string[]>>({});

  tenantId = $state<string>("default");
  isLoaded = $state(false);
  loading = $state(false);
  private initPromise: Promise<void> | null = null;
  healthStatus = $state<"healthy" | "unhealthy" | "initializing">("initializing");
  lastHealthCheck = $state<number | undefined>(undefined);

  /** Detect E2E test mode via window flag */
  private static isE2ETestMode(): boolean {
    return typeof window !== "undefined" && (window as any).__SVELTYCMS_E2E__ === true;
  }

  /** Known widget names from the project filesystem for E2E test mode */
  private static readonly E2E_WIDGET_NAMES = [
    "Input",
    "Select",
    "Checkbox",
    "Radio",
    "Number",
    "RichText",
    "Email",
    "Slug",
    "DateTime",
    "Group",
    "Relation",
    "MediaUpload",
    "Tags",
    "SEO",
    "Repeater",
    "DateRange",
    "Currency",
    "Rating",
    "Markdown",
    "ColorPicker",
    "PhoneNumber",
    "Address",
    "Price",
    "Geolocation",
    "JSONEditor",
    "RemoteVideo",
    "MegaMenu",
    "AIEnrichment",
  ];

  /**
   * Synchronous E2E test init — populates the store with known widget names
   * without any async scanner imports or API calls.
   */
  private _initE2EMode(): void {
    if (this.isLoaded) return;

    const functions: WidgetRegistry = {};
    const coreList: string[] = [];
    const customList: string[] = [];

    for (let i = 0; i < WidgetState.E2E_WIDGET_NAMES.length; i++) {
      const name = WidgetState.E2E_WIDGET_NAMES[i];
      const isCore = i < 12;
      const fn: any = (config: any) => ({
        label: config?.label || name,
        type: name.toLowerCase(),
        widget: { key: name, Name: name },
      });
      fn.Name = name;
      fn.Icon = "mdi:puzzle";
      fn.Description = `${name} widget`;
      fn.GuiSchema = {};
      fn.__widgetType = isCore ? "core" : "custom";
      functions[name] = fn;
      if (isCore) coreList.push(name);
      else customList.push(name);
    }

    this.widgetFunctions = functions;
    this.coreWidgets = coreList;
    this.customWidgets = customList;
    this.marketplaceWidgets = [];
    this.dependencyMap = {};
    this.activeWidgets = [...coreList];
    this.widgets = {};
    for (const name of Object.keys(functions)) {
      this.widgets[name] = (functions[name] as any)({ label: name });
    }
    this.isLoaded = true;
    this.loading = false;
    this.healthStatus = "healthy";
    this.lastHealthCheck = Date.now();
    this.initPromise = null;
  }

  // --- Analysis Helpers (Private) ---
  private extractWidgetType(field: FieldDefinition): string | null {
    if (typeof field === "object" && field !== null) {
      if ("__widgetName" in field) return (field as WidgetPlaceholder).__widgetName;
      if ("type" in field && typeof field.type === "string") return field.type;
      if ("widget" in field && field.widget && typeof field.widget === "object") {
        const widget = field.widget as { Name?: string; __widgetName?: string };
        if (widget.Name) return widget.Name;
        if (widget.__widgetName) return widget.__widgetName;
      }
    }
    return null;
  }

  // Recursive field analyzer
  private analyzeFields(fields: FieldDefinition[], required: string[], optional: string[]) {
    for (const field of fields) {
      const widgetType = this.extractWidgetType(field);
      if (widgetType) {
        const isRequired =
          typeof field === "object" && field !== null && "required" in field
            ? (field as any).required
            : true;
        if (isRequired) {
          if (!required.includes(widgetType)) required.push(widgetType);
        } else if (!optional.includes(widgetType)) {
          optional.push(widgetType);
        }
      }
      if (
        typeof field === "object" &&
        field !== null &&
        "fields" in field &&
        Array.isArray((field as any).fields)
      ) {
        this.analyzeFields((field as any).fields, required, optional);
      }
    }
  }

  // --- Public Analysis Methods ---

  analyzeCollection(schema: Schema): CollectionWidgetDependency {
    const requiredWidgets: string[] = [];
    const optionalWidgets: string[] = [];
    this.analyzeFields(schema.fields || [], requiredWidgets, optionalWidgets);

    return {
      collectionId: schema._id as string,
      collectionName: schema.name || "Unknown",
      requiredWidgets,
      optionalWidgets,
      missingWidgets: requiredWidgets.filter((w) => !this.activeWidgets.includes(w)),
    };
  }

  validateCollections(schemas: Schema[]) {
    const analyses = schemas.map((s) => this.analyzeCollection(s));
    const valid = analyses.filter((a) => a.missingWidgets.length === 0);
    const invalid = analyses.filter((a) => a.missingWidgets.length > 0);
    const warnings = invalid.map(
      (a) => `Collection "${a.collectionName}" is missing widgets: \${a.missingWidgets.join(", ")}`,
    );

    return { valid, invalid, warnings };
  }

  async initialize(tenantId = "default", dbAdapter?: DatabaseAdapter | null) {
    // E2E test mode: synchronous path without scanner / API
    if (WidgetState.isE2ETestMode()) {
      this._initE2EMode();
      return;
    }

    const wsLogger = logger.channel("WidgetStore");
    wsLogger.debug(`initialize called for tenant: ${tenantId}. isLoaded: ${this.isLoaded}`);
    // 🛡️ Optimization: Don't load widgets during setup wizard
    // We only need them for the actual CMS functionality.
    let setupDone = false;
    try {
      const { isSetupComplete } = await import("@src/utils/setup-check-fast");
      setupDone = isSetupComplete();
    } catch {
      wsLogger.trace("setup check unavailable (client-side), assuming complete.");
      setupDone = true;
    }
    if (!setupDone) {
      wsLogger.trace("setup NOT complete, exiting initialize early.");
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.isLoaded && this.tenantId === tenantId && !dbAdapter) {
      return;
    }

    this.loading = true;
    this.tenantId = tenantId;

    this.initPromise = (async () => {
      wsLogger.debug(`Starting internal init promise for tenant: ${tenantId}`);
      try {
        if (typeof process !== "undefined" && process.env.VERBOSE_TESTS === "true") {
          wsLogger.info(`Initializing for tenant: ${tenantId}`);
        }
        // 1. Load modules from scanner
        const { coreModules, customModules } = await import("@src/widgets/scanner");

        const newWidgetFunctions: WidgetRegistry = {};
        const newCoreWidgets: string[] = [];
        const newCustomWidgets: string[] = [];
        const newDependencyMap: Record<string, string[]> = {};

        wsLogger.trace(`Core modules available: ${Object.keys(coreModules).length}`);
        wsLogger.trace(`Custom modules available: ${Object.keys(customModules).length}`);

        // Process core widgets
        for (const [path, module] of Object.entries(coreModules)) {
          const name = path.split("/").at(-2);
          if (!name) {
            continue;
          }

          try {
            wsLogger.trace(`Processing module at ${path}`);
            const fn = (module as { default: WidgetFactory }).default;
            if (typeof fn !== "function") {
              wsLogger.warn(
                `Module at ${path} default export is NOT a function: ${typeof fn}. Keys: ${Object.keys(module || {})}`,
              );
              continue;
            }

            const widgetName = fn.Name || name;
            if (typeof process !== "undefined" && process.env.BENCHMARK_DEBUG === "true") {
              console.info(
                `[WidgetStore] Registered core widget: ${widgetName} (has modifyRequest: ${!!fn.modifyRequest})`,
              );
            }
            fn.Name = widgetName;
            fn.__widgetType = "core";

            newWidgetFunctions[widgetName] = fn;
            newCoreWidgets.push(widgetName);

            const deps = (fn as any).__dependencies;
            if (deps && Array.isArray(deps) && deps.length > 0) {
              newDependencyMap[widgetName] = deps;
            }

            if (name && name !== widgetName) {
              newWidgetFunctions[name] = fn;
            }
          } catch (err) {
            logger.error(`[WidgetStore] Failed to load core widget at ${path}:`, err);
          }
        }

        // Process custom widgets
        for (const [path, module] of Object.entries(customModules)) {
          const name = path.split("/").at(-2);
          if (!name) {
            continue;
          }

          try {
            const fn = (module as { default: WidgetFactory }).default;
            if (typeof fn !== "function") {
              continue;
            }

            const widgetName = fn.Name || name;
            fn.Name = widgetName;
            fn.__widgetType = "custom";

            newWidgetFunctions[widgetName] = fn;
            newCustomWidgets.push(widgetName);

            const deps = (fn as any).__dependencies;
            if (deps && Array.isArray(deps) && deps.length > 0) {
              newDependencyMap[widgetName] = deps;
            }

            if (name && name !== widgetName) {
              newWidgetFunctions[name] = fn;
            }
          } catch (err) {
            logger.error(`[WidgetStore] Failed to load custom widget at ${path}:`, err);
          }
        }

        this.widgetFunctions = newWidgetFunctions;
        this.coreWidgets = newCoreWidgets;
        this.customWidgets = newCustomWidgets;
        this.dependencyMap = newDependencyMap;

        // 2. Load active status from DB if available
        let activeWidgetNames: string[] = [];
        if (dbAdapter) {
          const activeRes = await dbAdapter.system.widgets.getActiveWidgets();
          if (activeRes.success) {
            activeWidgetNames = (activeRes.data ?? []).map((w) => w.name);
          }
        } else if (typeof window !== "undefined") {
          // Fallback to API if adapter not passed (client-side)
          const res = await fetch(`/api/widgets/active${this.isLoaded ? "" : "?refresh=true"}`, {
            headers: { "X-Tenant-ID": tenantId },
          });
          if (res.ok) {
            const data = await res.json();
            activeWidgetNames = (data.widgets || []).map((w: { name: string }) => w.name);
          }
        }

        // Normalize and merge core
        const normalizedActive = activeWidgetNames
          .map((name) => {
            if (this.widgetFunctions[name]) {
              return name;
            }
            const camelCase = name.charAt(0).toLowerCase() + name.slice(1);
            if (this.widgetFunctions[camelCase]) {
              return camelCase;
            }
            const lowerCase = name.toLowerCase();
            if (this.widgetFunctions[lowerCase]) {
              return lowerCase;
            }
            return null;
          })
          .filter((name): name is string => name !== null);

        // IMPORTANT: Core widgets are ALWAYS active and cannot be deactivated
        // Merge core widgets with active widgets from database
        const allActiveWidgets = [...new Set([...normalizedActive, ...newCoreWidgets])];

        this.activeWidgets = allActiveWidgets;

        // Create instances
        const newWidgets: Record<string, FieldInstance> = {};
        for (const [name, fn] of Object.entries(this.widgetFunctions)) {
          // Cast to any first to bypass complex union mismatch if necessary, or better, to its known factory signature
          newWidgets[name] = (fn as any)({ label: name });
        }
        this.widgets = newWidgets;

        this.isLoaded = true;
        this.healthStatus = "healthy";
        this.lastHealthCheck = Date.now();

        if (typeof process !== "undefined" && process.env.VERBOSE_TESTS === "true") {
          logger.info(
            `[WidgetStore] Initialized: ${this.coreWidgets.length} core, ${this.customWidgets.length} custom widgets.`,
          );
        }
      } catch (e) {
        this.healthStatus = "unhealthy";
        this.isLoaded = true; // Prevent infinite spinner — show empty state
        logger.error("[WidgetStore] Initialization failed:", e);
      } finally {
        this.loading = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async updateStatus(name: string, status: WidgetStatus, tenantId?: string | null) {
    const targetTenant = tenantId || this.tenantId;
    const active = status === "active";

    if (active && isWidgetCore(name)) {
      return; // Core always active
    }

    if (!(active || canDisableWidget(name))) {
      throw new Error(`Cannot disable widget ${name}: other widgets depend on it`);
    }

    if (active) {
      const deps = getWidgetDependencies(name);
      const inactiveDeps = deps.filter((dep) => !isWidgetActive(dep));
      if (inactiveDeps.length > 0) {
        throw new Error(
          `Cannot activate widget ${name}: missing dependencies: ${inactiveDeps.join(", ")}`,
        );
      }
    }

    // Update DB
    try {
      await this.updateInDatabase(name, active, targetTenant);

      // Update state
      if (active) {
        if (!this.activeWidgets.includes(name)) {
          this.activeWidgets.push(name);
        }
      } else {
        this.activeWidgets = this.activeWidgets.filter((w) => w !== name);
      }

      if (typeof process !== "undefined" && process.env.VERBOSE_TESTS === "true") {
        logger.info(`[WidgetStore] Widget '${name}' status changed to '${status}'`);
      }
    } catch (e) {
      logger.error(`[WidgetStore] Failed to update status for ${name}:`, e);
      throw e;
    }
  }

  async updateConfig(name: string, config: Record<string, unknown>) {
    const currentFn = this.widgetFunctions[name];
    if (!currentFn || typeof currentFn !== "function") {
      return;
    }

    const updatedFn = Object.assign(
      (cfg: Record<string, unknown>) => (currentFn as any)({ ...config, ...cfg }),
      currentFn,
    );

    this.widgetFunctions[name] = updatedFn;
    this.widgets[name] = (updatedFn as any)({ label: name });
  }

  async reload(tenantId?: string | null) {
    this.isLoaded = false;
    await this.initialize(tenantId || this.tenantId);
  }

  private async updateInDatabase(name: string, active: boolean, tenantId: string) {
    if (typeof window !== "undefined") {
      const res = await fetch("/api/widgets/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": tenantId,
        },
        body: JSON.stringify({ widgetName: name, isActive: active }),
      });
      if (!res.ok) {
        throw new Error("Database sync failed");
      }
    }
  }
  /**
   * Compatibility alias for widget registry lookup.
   * Used by benchmarks and legacy components.
   */
  getWidgetModule(name: string | { label: string }): WidgetFactory | undefined {
    const widgetName = typeof name === "string" ? name : name.label;
    // Normalize name to PascalCase if not found as-is
    if (this.widgetFunctions[widgetName]) return this.widgetFunctions[widgetName] as WidgetFactory;

    const pascalName = widgetName.charAt(0).toUpperCase() + widgetName.slice(1);
    return this.widgetFunctions[pascalName] as WidgetFactory;
  }
}

const widgetStateInstance = new WidgetState();

/**
 * Single export for both store state and widget factory functions.
 * Enables widgets.Date(), widgets.Group(), etc. in collection schemas while keeping store methods.
 * Methods are bound to the real instance so $state/private fields work (Proxy would break them).
 */
export const widgets = new Proxy(widgetStateInstance, {
  get(target, prop: string) {
    const own = (target as unknown as Record<string, unknown>)[prop];
    if (own !== undefined) {
      if (typeof own === "function") {
        return (own as (...args: unknown[]) => unknown).bind(target);
      }
      return own;
    }
    // Fallback to widget functions
    const fn = target.widgetFunctions[prop];
    if (fn) return fn;

    // Support camelCase fallback for common widget lookups
    const pascalName = prop.charAt(0).toUpperCase() + prop.slice(1);
    return target.widgetFunctions[pascalName];
  },
}) as WidgetState & Record<string, WidgetFactory>;

// --- Helper Functions ---

export function getWidget(name: string) {
  return widgetStateInstance.widgets[name];
}

export function getWidgetFunction(name: string) {
  return widgetStateInstance.widgetFunctions[name];
}

/** Returns all registered widget names (keys) */
export function getWidgetNames(): string[] {
  return Object.keys(widgetStateInstance.widgetFunctions);
}

export function isWidgetActive(name: string): boolean {
  return widgets.activeWidgets.includes(name);
}

export function isWidgetCore(name: string): boolean {
  return widgets.coreWidgets.includes(name);
}

export function isWidgetCustom(name: string): boolean {
  return widgets.customWidgets.includes(name);
}

export function isWidgetMarketplace(name: string): boolean {
  return widgets.marketplaceWidgets.includes(name);
}

export function getWidgetDependencies(name: string): string[] {
  return widgetStateInstance.dependencyMap[name] || [];
}

export function canDisableWidget(name: string): boolean {
  if (isWidgetCore(name)) {
    return false;
  }
  const dependents = Object.entries(widgetStateInstance.dependencyMap)
    .filter(([, deps]) => deps.includes(name))
    .map(([n]) => n);
  return !dependents.some(isWidgetActive);
}

export function isWidgetAvailable(name: string): boolean {
  return !!getWidgetFunction(name) && isWidgetActive(name);
}

// Compatibility export for theme branch components
export const widgetStoreActions = {
  updateStatus: widgetStateInstance.updateStatus.bind(widgetStateInstance),
  updateConfig: widgetStateInstance.updateConfig.bind(widgetStateInstance),
  reload: widgetStateInstance.reload.bind(widgetStateInstance),
  initializeWidgets: widgetStateInstance.initialize.bind(widgetStateInstance),
};

// Compatibility store for legacy components
export const widgetFunctions = {
  subscribe(fn: (value: WidgetRegistry) => void) {
    fn(widgetStateInstance.widgetFunctions);
    return () => {}; // Non-reactive for now, sufficient for initial load or use $effect if needed
  },
};

// HMR
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    widgetStateInstance.reload();
  });
}
