/**
 * @file src/widgets/scanner.ts
 * @description Centralized widget scanner using Vite's import.meta.glob with Bun fallback.
 * Provides a single source of truth for widget discovery to avoid redundant scanning.
 */

// 1. Vite/SvelteKit Native Scanning
let coreModulesRaw: Record<string, any> = {};
let customModulesRaw: Record<string, any> = {};
let widgetComponentsRaw: Record<string, any> = {};

try {
  // Vite requires these to be statically analyzable without conditionals
  coreModulesRaw = import.meta.glob("./core/*/index.ts", { eager: true });
  customModulesRaw = import.meta.glob("./custom/*/index.ts", { eager: true });
  widgetComponentsRaw = import.meta.glob(["./core/*/*.svelte", "./custom/*/*.svelte"]);
} catch {
  // Fallback for non-Vite environments
}

export const coreModules = coreModulesRaw;
export const customModules = customModulesRaw;
export const widgetComponents = widgetComponentsRaw;

// 2. Bun/Production Fallback (for Benchmarks and Non-Vite environments)
if (Object.keys(coreModules).length === 0 && typeof process !== "undefined") {
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const fs = require("node:fs");
    const path = require("node:path");

    const projectRoot = process.cwd();
    const corePath = path.join(projectRoot, "src/widgets/core");
    const customPath = path.join(projectRoot, "src/widgets/custom");

    const scan = (dirPath: string, subDir: string) => {
      if (!fs.existsSync(dirPath)) return {};
      const modules: Record<string, any> = {};
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const indexPath = path.join(dirPath, entry.name, "index.ts");
          if (fs.existsSync(indexPath)) {
            // In Bun/Node fallback, we create a proxy factory that mimics the widget
            const widgetName = entry.name
              .split("-")
              .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
              .join("");

            const factory = (args: any) => ({
              Name: widgetName,
              ...args,
              widget: { Name: widgetName },
            });
            factory.Name = widgetName;

            modules[`./${subDir}/${entry.name}/index.ts`] = { default: factory };
          }
        }
      }
      return modules;
    };

    Object.assign(coreModules, scan(corePath, "core"));
    Object.assign(customModules, scan(customPath, "custom"));
  } catch {
    // Silent fail in environments where fs is not available
  }
}

export const allWidgetModules = { ...coreModules, ...customModules };

/**
 * Resolves a component loader for a widget.
 */
export function getComponentLoader(
  widgetName: string,
  type: "input" | "display" = "input",
): (() => Promise<{ default: any }>) | null {
  const normalized = widgetName.toLowerCase();

  // Search in known components (Vite mode)
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

  // Final fuzzy search
  for (const path in widgetComponents) {
    const lowerPath = path.toLowerCase();
    if (lowerPath.includes(`/${normalized}/${type}.svelte`)) {
      return widgetComponents[path] as () => Promise<{ default: any }>;
    }
  }

  // Bun Fallback: Return a stub loader that yields a placeholder component
  if (Object.keys(coreModules).length === 0) {
    return async () => ({ default: { name: "Placeholder" } });
  }

  return null;
}

/**
 * Extracts widget name from file path
 * @param path - The file path (e.g., './core/input/index.ts')
 * @returns The widget name (e.g., 'input')
 */
export function getWidgetNameFromPath(path: string): string | null {
  const parts = path.split("/");
  return parts.at(-2) || null;
}
