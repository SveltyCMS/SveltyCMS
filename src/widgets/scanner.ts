/**
 * @file src/widgets/scanner.ts
 * @description Centralized widget scanner using Vite's import.meta.glob with Bun fallback.
 */

// 1. Vite/SvelteKit Native Scanning
let coreModulesRaw: Record<string, any> = {};
let customModulesRaw: Record<string, any> = {};
let widgetComponentsRaw: Record<string, any> = {};

try {
  coreModulesRaw = import.meta.glob("./core/*/index.ts", { eager: true });
  customModulesRaw = import.meta.glob("./custom/*/index.ts", { eager: true });
  widgetComponentsRaw = import.meta.glob(["./core/*/*.svelte", "./custom/*/*.svelte"]);
} catch {
  // Fallback for non-Vite environments
}

export const coreModules = coreModulesRaw;
export const customModules = customModulesRaw;
export const widgetComponents = widgetComponentsRaw;

/**
 * 🚀 Bun/Production Fallback (for Benchmarks and Non-Vite environments)
 * This is executed only when Vite's glob import fails to find modules.
 */
function initBunFallback() {
  const isBrowser = typeof window !== "undefined";
  if (isBrowser || Object.keys(coreModules).length > 0) return;
  if (typeof process === "undefined" || process.env.SVELTY_BENCHMARK_SUITE !== "true") return;

  try {
    const g = globalThis as any;
    const nodeRequire = g["require"];
    if (!nodeRequire) return;

    const fs = nodeRequire("node:fs");
    const path = nodeRequire("node:path");

    const scan = (dirPath: string, subDir: string) => {
      if (!fs.existsSync(dirPath)) return {};
      const modules: Record<string, any> = {};
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const indexPath = path.join(dirPath, entry.name, "index.ts");
          if (fs.existsSync(indexPath)) {
            try {
              const module = nodeRequire(indexPath);
              modules[`./${subDir}/${entry.name}/index.ts`] = module;
            } catch (err: any) {
              console.warn(`[Scanner] Failed to require widget ${entry.name}:`, err.message);
            }
          }
        }
      }
      return modules;
    };

    const projectRoot = process.cwd();
    const corePath = path.join(projectRoot, "src/widgets/core");
    const customPath = path.join(projectRoot, "src/widgets/custom");

    Object.assign(coreModules, scan(corePath, "core"));
    Object.assign(customModules, scan(customPath, "custom"));
  } catch {
    // Silent fail
  }
}

// Initialize fallback
initBunFallback();

export const allWidgetModules = { ...coreModules, ...customModules };

/**
 * Resolves a component loader for a widget.
 */
export function getComponentLoader(
  widgetName: string,
  type: "input" | "display" = "input",
): (() => Promise<{ default: any }>) | null {
  const normalized = widgetName.toLowerCase();

  const searchPatterns = [
    `./core/${normalized}/${type}.svelte`,
    `./custom/${normalized}/${type}.svelte`,
    `./core/${normalized}/index.svelte`,
    `./custom/${normalized}/index.svelte`,
  ];

  for (const pattern of searchPatterns) {
    if (widgetComponents[pattern]) {
      return widgetComponents[pattern] as () => Promise<{ default: any }>;
    }
  }

  for (const path in widgetComponents) {
    if (path.toLowerCase().includes(`/${normalized}/${type}.svelte`)) {
      return widgetComponents[path] as () => Promise<{ default: any }>;
    }
  }

  if (Object.keys(coreModules).length === 0) {
    return async () => ({ default: { name: "Placeholder" } });
  }

  return null;
}

/**
 * Extracts widget name from file path
 */
export function getWidgetNameFromPath(path: string): string | null {
  const parts = path.split("/");
  return parts.at(-2) || null;
}
