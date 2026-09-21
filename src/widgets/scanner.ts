/**
 * @file src/widgets/scanner.ts
 * @description
 * Centralized widget scanner module for SveltyCMS.
 *
 * Responsibilities include:
 * - Dynamically scanning core, custom, and marketplace widget modules via Vite's `import.meta.glob`.
 * - Providing a resilient synchronous fallback scanner for Bun/Node (CLI/tests).
 * - Resolving input/display loaders using the single naming convention
 *   (factory Name → kebab-case folder under core|custom|marketplace).
 *
 * ### Features:
 * - Vite-native eager glob parsing
 * - Resilient Bun filesystem fallback
 * - Path-to-widget component matching (Name ↔ folder invariant)
 */

import { logger } from "@utils/logger";
import { WIDGET_COMPONENT_ROOTS, folderFromWidgetPath, widgetNameToFolder } from "./widget-naming";

// 1. Vite/SvelteKit Native Scanning
/** Materialized factories. Empty until `loadWidgetFactories` (or the Bun fallback) fills them. */
export const coreModules: Record<string, any> = {};
export const customModules: Record<string, any> = {};
export const marketplaceModules: Record<string, any> = {};
export const widgetComponents: Record<string, any> = {};

/**
 * One loader per widget folder. Static `import.meta.glob` so the production
 * bundle emits a real chunk per factory, evaluated only when that widget is
 * named by a collection schema.
 */
export const coreModuleLoaders: Record<string, () => Promise<unknown>> = {};
export const customModuleLoaders: Record<string, () => Promise<unknown>> = {};
export const marketplaceModuleLoaders: Record<string, () => Promise<unknown>> = {};

try {
  // STATIC import.meta.glob — Vite transforms these calls into chunk loaders.
  // A non-static `(import.meta as any).glob(...)` is not transformed and the
  // production registry stays empty.
  Object.assign(coreModuleLoaders, import.meta.glob("./core/*/index.ts"));
  Object.assign(customModuleLoaders, import.meta.glob("./custom/*/index.ts"));
  Object.assign(marketplaceModuleLoaders, import.meta.glob("./marketplace/*/index.ts"));
  Object.assign(
    widgetComponents,
    import.meta.glob(["./core/*/*.svelte", "./custom/*/*.svelte", "./marketplace/*/*.svelte"]),
  );

  if (typeof process !== "undefined" && process.env.BENCHMARK_DEBUG === "true") {
    logger.debug(
      `[Scanner Debug] Vite Glob: ${Object.keys(coreModuleLoaders).length} core, ${Object.keys(customModuleLoaders).length} custom, ${Object.keys(marketplaceModuleLoaders).length} marketplace.`,
    );
  }
} catch (err: any) {
  if (typeof process !== "undefined" && process.env.BENCHMARK_DEBUG === "true") {
    logger.error(`[Scanner Debug] Vite Glob failed: ${err.message}`);
  }
}

/**
 * 🚀 Bun/Production Fallback (for Benchmarks and Non-Vite environments)
 * This is executed only when Vite's glob import fails to find modules.
 */
function initBunFallback() {
  const isBrowser = typeof window !== "undefined";
  if (isBrowser) return;

  // 🚀 RESILIENCE: If we already have modules, don't run fallback
  if (Object.keys(coreModuleLoaders).length > 0 || Object.keys(coreModules).length > 0) {
    return;
  }

  try {
    const g = globalThis as any;
    const nodeRequire =
      g["require"] ||
      (typeof require !== "undefined" ? require : undefined) ||
      (typeof import.meta !== "undefined" ? (import.meta as any).require : undefined);
    if (!nodeRequire) return;

    const fs = nodeRequire("node:fs");
    const path = nodeRequire("node:path");

    const scan = (dirPath: string, subDir: string) => {
      if (!fs.existsSync(dirPath)) return {};
      const modules: Record<string, any> = {};
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      let failed = 0;
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const indexPath = path.join(dirPath, entry.name, "index.ts");
          if (fs.existsSync(indexPath)) {
            try {
              const module = nodeRequire(indexPath);
              modules[`./${subDir}/${entry.name}/index.ts`] = module;
            } catch (err: any) {
              // Expected outside Vite/Bun glob support: source .ts widget files
              // import path aliases that a plain node require() cannot resolve
              // from a built bundle. The Vite glob (above) is the production
              // path; this fallback is only a last resort for CLI scripts.
              failed++;
              if (process.env.BENCHMARK_DEBUG === "true") {
                logger.debug(`[Scanner] Fallback require failed for ${entry.name}:`, err.message);
              }
            }
          }
        }
      }
      if (failed > 0 && process.env.BENCHMARK_DEBUG === "true") {
        logger.debug(`[Scanner] Fallback could not require ${failed} widget(s) in ${dirPath}`);
      }
      return modules;
    };

    const projectRoot = typeof process !== "undefined" && process.cwd ? process.cwd() : ".";
    Object.assign(coreModules, scan(path.join(projectRoot, "src/widgets/core"), "core"));
    Object.assign(customModules, scan(path.join(projectRoot, "src/widgets/custom"), "custom"));
    Object.assign(
      marketplaceModules,
      scan(path.join(projectRoot, "src/widgets/marketplace"), "marketplace"),
    );
  } catch (err: unknown) {
    logger.error("[Scanner] Fallback error:", err);
  }
}

// Initialize fallback
initBunFallback();

/**
 * Kebab-case folder names of all custom widget modules.
 * Derived from the already-loaded glob keys — no factory invocation.
 * Used by telemetry/diagnostics only.
 */
export function getCustomWidgetNames(): string[] {
  const names: string[] = [];
  const paths =
    Object.keys(customModuleLoaders).length > 0
      ? Object.keys(customModuleLoaders)
      : Object.keys(customModules);
  for (const path of paths) {
    const folder = folderFromWidgetPath(path);
    if (folder) names.push(folder);
  }
  return names;
}

/** True when a factory chunk exists for this widget Name. Does not import it. */
export function hasWidgetLoader(widgetName: string): boolean {
  const folder = widgetNameToFolder(widgetName);
  if (!folder) return false;
  const needle = `/${folder}/index.ts`;
  for (const loaders of [coreModuleLoaders, customModuleLoaders, marketplaceModuleLoaders]) {
    for (const path of Object.keys(loaders)) {
      if (path.replace(/\\/g, "/").endsWith(needle)) return true;
    }
  }
  return false;
}

/**
 * Import factory chunks. With `names`, only those widget Names are evaluated.
 * Without `names`, every factory is imported (admin catalog).
 * Already materialized modules are left in place.
 */
export async function loadWidgetFactories(names?: Iterable<string>): Promise<void> {
  const wanted = names ? new Set(Array.from(names, (name) => widgetNameToFolder(name))) : null;
  const tiers: Array<[Record<string, () => Promise<unknown>>, Record<string, any>]> = [
    [coreModuleLoaders, coreModules],
    [customModuleLoaders, customModules],
    [marketplaceModuleLoaders, marketplaceModules],
  ];
  const pending: Promise<void>[] = [];
  for (const [loaders, cache] of tiers) {
    for (const path of Object.keys(loaders)) {
      if (cache[path]) continue;
      const folder = folderFromWidgetPath(path);
      if (wanted && (!folder || !wanted.has(folder))) continue;
      const load = loaders[path];
      if (typeof load !== "function") continue;
      pending.push(
        load().then((mod) => {
          cache[path] = mod;
        }),
      );
    }
  }
  await Promise.all(pending);
}

/** `${folder}:${input|display}` → glob loader. Built once, O(1) thereafter. */
let componentIndex: Map<string, () => Promise<{ default: unknown }>> | null = null;

function getComponentIndex(): Map<string, () => Promise<{ default: unknown }>> {
  if (componentIndex) return componentIndex;
  componentIndex = new Map();
  for (const path in widgetComponents) {
    const folder = folderFromWidgetPath(path);
    if (!folder) continue;
    const lower = path.replace(/\\/g, "/").toLowerCase();
    const suffix = lower.endsWith("/display.svelte")
      ? "display"
      : lower.endsWith("/input.svelte")
        ? "input"
        : null;
    if (!suffix) continue;
    const key = `${folder.toLowerCase()}:${suffix}`;
    if (!componentIndex.has(key)) {
      componentIndex.set(key, widgetComponents[path] as () => Promise<{ default: unknown }>);
    }
  }
  return componentIndex;
}

/**
 * Resolves a component loader for a widget by factory Name.
 * Paths: `./{core|custom|marketplace}/{kebab(Name)}/{input|display}.svelte`
 */
export function getComponentLoader(
  widgetName: string,
  type: "input" | "display" = "input",
): (() => Promise<{ default: any }>) | null {
  if (!widgetName) return null;

  const folder = widgetNameToFolder(widgetName);
  const indexed = getComponentIndex().get(`${folder}:${type}`);
  if (indexed) return indexed as () => Promise<{ default: any }>;

  for (const root of WIDGET_COMPONENT_ROOTS) {
    const pattern = `./${root}/${folder}/${type}.svelte`;
    if (widgetComponents[pattern]) {
      return widgetComponents[pattern] as () => Promise<{ default: any }>;
    }
  }

  if (Object.keys(coreModules).length === 0) {
    return async () => ({ default: { name: "Placeholder" } });
  }

  return null;
}
